import { simulateReadableStream, tool, zodSchema, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { registerChaiBlock } from "~/registry";
import { getChaiActionInstance } from "~/server/chai-actions/actions-registery";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { registerChaiAiCustomization, resetChaiAiCustomizersForTests } from "~/server/plugin-api/ai-customization";
import { useTestChaiConfig, withChaiConfig } from "~/tests/setup/chai-config";
import { loadWebBlocks } from "~/web-blocks";
import { AIEditPageAction } from "./ai-edit-page-action";

loadWebBlocks();

// A real registered custom block, so the prompt's custom block catalog lists it.
registerChaiBlock(
  (() => null) as any,
  {
    type: "ProductCard",
    label: "Product Card",
    group: "test",
    description: "Shows a product",
    props: { schema: { properties: { productId: { type: "string", title: "Product ID" } } } },
    aiProps: ["productId"],
  } as any,
);

type ModelCall = Parameters<MockLanguageModelV3["doStream"]>[0];
type StreamPart = any;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const finish = (unified: "stop" | "tool-calls"): StreamPart => ({
  type: "finish",
  finishReason: { unified, raw: unified },
  usage,
});

const textStep = (text = "Done"): StreamPart[] => [
  { type: "stream-start", warnings: [] },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  finish("stop"),
];

const toolCallStep = (toolName: string, input: unknown): StreamPart[] => [
  { type: "stream-start", warnings: [] },
  { type: "tool-call", toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
  finish("tool-calls"),
];

/**
 * The model is the network boundary: a real AI SDK mock model that answers each step with the
 * scripted stream parts (a plain text reply once the script runs out). It is wired in through the
 * real `ai.resolveModel` config, so the action's own streamText path runs end to end and the
 * dataStream Response is consumed for real.
 */
function useScriptedModel(steps: StreamPart[][] = []) {
  const calls: ModelCall[] = [];
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      calls.push(options);
      const chunks = steps[calls.length - 1] ?? textStep();
      return { stream: simulateReadableStream({ chunks, chunkDelayInMs: null }) };
    },
  });
  useTestChaiConfig({
    pageTypes: [{ key: "landing", name: "Landing", description: "A landing page" }],
    ai: { resolveModel: () => ({ model }) },
  });
  // The edition's plans plugin turns AI credits on; credit accounting is covered elsewhere.
  withChaiConfig({ features: { ...getActiveChaiBuilderConfig().features, aiCredits: false } as never });
  return calls;
}

/** Runs the action as the dispatcher would and drains the streamed response. */
async function run(data: Record<string, unknown>, contextOverrides: Record<string, unknown> = {}) {
  const action = new AIEditPageAction();
  action.setContext({ action: "AI_EDIT_PAGE", userId: "u1", appId: "a1", ...contextOverrides } as any);
  const result = await action.execute({ model: "test-model", ...data } as any);
  const body = await result._streamResult.dataStream.text();
  return { result, body };
}

const systemOf = (call: ModelCall): string =>
  call.prompt
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");

const toolNamesOf = (call: ModelCall): string[] => (call.tools ?? []).map((t) => t.name).sort();

/** The tool results the model received on a later step. */
const toolResultsOf = (call: ModelCall): Record<string, unknown> =>
  Object.fromEntries(
    call.prompt
      .filter((message) => message.role === "tool")
      .flatMap((message) => message.content as any[])
      .filter((part) => part.type === "tool-result")
      .map((part) => [part.toolName, part.output?.value]),
  );

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const assistantWithEdit = (id: string, html: string): UIMessage =>
  ({
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-edit_block",
        toolCallId: `call-${id}`,
        state: "output-available",
        input: { task: "Edit hero", blockId: "hero-1", html },
        output: { ok: true },
      },
    ],
  }) as unknown as UIMessage;

describe("AIEditPageAction (tool-call / UIMessage flow)", () => {
  it("returns a dataStream Response envelope for the dispatcher", async () => {
    useScriptedModel();
    const { result, body } = await run({
      messages: [userMessage("m1", "Add a hero section")],
      pageOutline: "box-1 | Box | Hero",
      pageHtml: "<div bid='box-1'></div>",
    });

    expect(result._streamingResponse).toBe(true);
    expect(result._streamResult.isDataStream).toBe(true);
    expect(result._streamResult.dataStream).toBeInstanceOf(Response);
    expect(result._streamResult.dataStream.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("Done");
  });

  it("builds the system prompt with outline, catalog, bindings and page type", async () => {
    const calls = useScriptedModel();
    await run({
      messages: [userMessage("m1", "hello")],
      pageOutline: "box-1 | Box | Hero Section",
      pageHtml: "<div bid='box-1'></div>",
      options: {
        pageType: "landing",
        dataBindingPaths: {
          global: ["global.user.name"],
          page: ["posts"],
          pathTypes: { "global.user.name": "string", posts: "array" },
        },
      },
    });

    const system = systemOf(calls[0]);
    expect(system).toContain("box-1 | Box | Hero Section");
    expect(system).toContain("ProductCard");
    expect(system).toContain("{{global.user.name}} (string)");
    expect(system).toContain("Example: {{path | currency 'USD'}}");
    expect(system).toContain("NEVER append the default pipe routinely");
    expect(system).toContain("Boolean formatters (conditional visibility / _show only)");
    expect(system).toContain("A landing page");
    expect(system).not.toContain("--START--");
    expect(system).not.toContain("{{PAGE_OUTLINE}}");
    expect(system).not.toContain("{{CUSTOM_BLOCK_CATALOG}}");
    expect(system).not.toContain("{{DESIGN_TOKENS_LIST}}");
  });

  it("omits options.hiddenBlockTypes from the custom block catalog", async () => {
    const calls = useScriptedModel();
    await run({
      messages: [userMessage("m1", "hello")],
      pageOutline: "box-1 | Box | Hero Section",
      pageHtml: "<div bid='box-1'></div>",
      options: {
        hiddenBlockTypes: ["ProductCard"],
      },
    });

    const system = systemOf(calls[0]);
    expect(system).not.toContain("### ProductCard");
  });

  it("exposes the full tool set with read_block_html bound to the request pageHtml", async () => {
    const calls = useScriptedModel([toolCallStep("read_block_html", { blockIds: ["hero-1"] })]);
    await run({
      messages: [userMessage("m1", "hello")],
      pageHtml: "<section bid='hero-1'><h1>Hi</h1></section>",
    });

    const hasLibraryActions = Boolean(
      getChaiActionInstance("GET_LIBRARIES") &&
      getChaiActionInstance("GET_LIBRARY_ITEMS") &&
      getChaiActionInstance("GET_LIBRARY_ITEM"),
    );
    const hasMediaActions = Boolean(getChaiActionInstance("CREATE_ASSET"));

    expect(toolNamesOf(calls[0])).toEqual(
      [
        "add_blocks",
        "add_custom_block",
        "bind_prop",
        "edit_block",
        "get_pages_list",
        "get_partial_blocks",
        "read_block_html",
        "read_blocks",
        "remove_blocks",
        "update_block_props",
        ...(hasLibraryActions ? ["add_library_block", "get_library_blocks"] : []),
        ...(hasMediaActions ? ["upload_image"] : []),
      ].sort(),
    );

    // The server executed read_block_html and handed the slice back to the model.
    expect(calls).toHaveLength(2);
    const slices = toolResultsOf(calls[1]).read_block_html as Record<string, string>;
    expect(slices["hero-1"]).toContain("Hi");
  });

  it("prunes html from tool inputs in all but the last assistant message", async () => {
    const calls = useScriptedModel();
    await run({
      messages: [
        userMessage("m1", "edit hero"),
        assistantWithEdit("a1", "<div>OLD HUGE HTML</div>"),
        userMessage("m2", "now edit footer"),
        assistantWithEdit("a2", "<div>LATEST HTML</div>"),
      ],
      pageHtml: "",
    });

    const serialized = JSON.stringify(calls[0].prompt);
    expect(serialized).not.toContain("OLD HUGE HTML");
    expect(serialized).toContain("LATEST HTML");
  });

  it("adds selected block context from the last user message metadata", async () => {
    const calls = useScriptedModel();
    await run({
      messages: [{ ...userMessage("m1", "make it pop"), metadata: { selectedBlockId: "hero-1" } }],
      pageHtml: "",
    });

    expect(systemOf(calls[0])).toContain('bid "hero-1"');
  });

  it("sanitizes a model error before it reaches the client stream", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error("boom\n--END--");
      },
    });
    useTestChaiConfig({ ai: { resolveModel: () => ({ model }) } });
    withChaiConfig({ features: { ...getActiveChaiBuilderConfig().features, aiCredits: false } as never });

    const { body } = await run({ messages: [userMessage("m1", "hello")], pageHtml: "" });

    expect(body).toContain("boom - -END- -");
    expect(body).not.toContain("--END--");
  });

  describe("root-app AI customization", () => {
    afterEach(() => resetChaiAiCustomizersForTests());

    it("applies a registered prompt customizer and passes the action context", async () => {
      const calls = useScriptedModel();
      const seen: any[] = [];
      registerChaiAiCustomization("test", {
        prompt: (prompt, ctx) => {
          seen.push(ctx);
          return `${prompt}\nAlways use British spelling.`;
        },
      });

      await run({
        messages: [userMessage("m1", "hello")],
        pageOutline: "box-1 | Box | Hero",
        pageHtml: "<div bid='box-1'></div>",
      });

      expect(systemOf(calls[0])).toContain("Always use British spelling.");
      expect(seen[0]).toMatchObject({ action: "AI_EDIT_PAGE", initiator: "page" });
    });

    it("merges a registered app tool alongside the built-in tools", async () => {
      const calls = useScriptedModel([toolCallStep("fetch_products", {})]);
      const appTool = tool({
        description: "fetch products",
        inputSchema: zodSchema(z.object({})),
        execute: async () => "ok",
      });
      registerChaiAiCustomization("test", { tools: () => ({ fetch_products: appTool }) });

      await run({
        messages: [userMessage("m1", "hello")],
        pageHtml: "<section bid='hero-1'><h1>Hi</h1></section>",
      });

      const names = toolNamesOf(calls[0]);
      expect(names).toContain("fetch_products");
      expect(names).toContain("read_block_html");
      expect(names).toContain("edit_block");
      // The app tool is the one the model's call ran.
      expect(toolResultsOf(calls[1]).fetch_products).toBe("ok");
    });

    it("tags a block-scoped run with the block initiator", async () => {
      useScriptedModel();
      const seen: any[] = [];
      registerChaiAiCustomization("test", {
        prompt: (prompt, ctx) => {
          seen.push(ctx);
          return prompt;
        },
      });

      await run({
        messages: [userMessage("m1", "make the heading bigger")],
        pageHtml: "<section bid='hero-1'><h1>Hi</h1></section>",
        scopedBlockId: "hero-1",
      });

      expect(seen[0]).toMatchObject({ action: "AI_EDIT_PAGE", initiator: "block" });
    });
  });

  describe("scopedBlockId (block floating AI)", () => {
    const PAGE_HTML = "<section bid='hero-1'><h1>Hi</h1></section><footer bid='foot-1'>F</footer>";

    /** Runs a block-scoped edit; `steps` scripts the model's tool calls. */
    const executeScoped = async (steps: StreamPart[][] = []) => {
      const calls = useScriptedModel(steps);
      await run({
        messages: [userMessage("m1", "make the heading bigger")],
        pageOutline: "hero-1 | Section | Hero\nfoot-1 | Footer | Footer",
        pageHtml: PAGE_HTML,
        scopedBlockId: "hero-1",
      });
      return calls;
    };

    const readBlocks = async (blockIds: string[]) => {
      const calls = await executeScoped([toolCallStep("read_block_html", { blockIds })]);
      return toolResultsOf(calls[1]).read_block_html as Record<string, string>;
    };

    // get_pages_list is a read-only lookup: linking one button is still a single-block edit.
    it("hands the model read, edit and scoped binding tools", async () => {
      const calls = await executeScoped();
      expect(toolNamesOf(calls[0])).toEqual([
        "bind_prop",
        "edit_block",
        "get_pages_list",
        "read_block_html",
        "read_blocks",
        "update_block_props",
      ]);
    });

    it("states the single-block scope in the system prompt", async () => {
      const calls = await executeScoped();
      const system = systemOf(calls[0]);
      expect(system).toContain("Edit Scope: Single Block (STRICT)");
      expect(system).toContain('ONLY the block with bid "hero-1"');
      expect(system).toContain("read, replace, or data-bind");
    });

    it("reads the scoped block", async () => {
      const slices = await readBlocks(["hero-1"]);
      expect(slices["hero-1"]).toContain("Hi");
    });

    it("refuses to read a block outside the scope", async () => {
      const slices = await readBlocks(["foot-1"]);
      expect(slices["foot-1"]).toContain("outside the current edit scope");
      expect(slices["foot-1"]).not.toContain("<footer");
    });

    it("refuses a batch that smuggles an out-of-scope bid alongside the scoped one", async () => {
      const slices = await readBlocks(["hero-1", "foot-1"]);
      expect(slices["foot-1"]).toContain("outside the current edit scope");
      expect(slices["hero-1"]).toBeUndefined();
    });
  });

  describe("JSON blocks, language view & design system parity", () => {
    it("derives page outline and language-view read_block_html directly from JSON blocks", async () => {
      const calls = useScriptedModel([toolCallStep("read_block_html", { blockIds: ["h-1"] })]);
      await run({
        messages: [userMessage("m1", "Edit heading")],
        blocks: [
          { _id: "sec-1", _type: "Box", _name: "Hero", styles: "#styles:,p-8" },
          {
            _id: "h-1",
            _type: "Heading",
            _parent: "sec-1",
            tag: "h1",
            content: "Hello",
            "content-fr": "Bonjour",
            styles: "#styles:,text-3xl",
          },
        ],
        pageId: "page-fr",
        primaryPageId: "page-en",
        pageName: "Accueil",
        pageSlug: "/fr",
        lang: "fr",
        fallbackLang: "en",
        variantLangs: ["fr"],
      });

      const system = systemOf(calls[0]);
      // Outline was derived server-side from JSON blocks in the French language view
      expect(system).toContain("sec-1 | Box | Hero");
      expect(system).toContain("Bonjour");
      expect(system).toContain("French (fr)");
      expect(toolNamesOf(calls[0])).toContain("get_page_blocks");
      expect(toolNamesOf(calls[0])).toContain("get_block_translations");
      expect(toolNamesOf(calls[0])).toContain("update_block_translations");
      expect(toolNamesOf(calls[0])).toContain("get_page_seo");
      expect(toolNamesOf(calls[0])).toContain("update_page_seo");

      const slices = toolResultsOf(calls[1]).read_block_html as Record<string, string>;
      expect(slices["h-1"]).toContain("Bonjour");
    });

    it("hides design-system prompt sections when feature is disabled and advertises them when enabled", async () => {
      const offCalls = useScriptedModel();
      await run({
        messages: [userMessage("m1", "hi")],
        blocks: [{ _id: "b1", _type: "Box" }],
      });
      expect(systemOf(offCalls[0])).not.toContain("## Design System");
      expect(toolNamesOf(offCalls[0])).not.toContain("get_design_system");

      const onCalls = useScriptedModel();
      withChaiConfig({
        features: {
          ...getActiveChaiBuilderConfig().features,
          aiCredits: false,
          designSystem: { enabled: true, designChecks: "warn" },
        } as never,
      });
      await run({
        messages: [userMessage("m1", "hi")],
        blocks: [{ _id: "b1", _type: "Box" }],
      });
      expect(systemOf(onCalls[0])).toContain("## Design System");
      expect(toolNamesOf(onCalls[0])).toContain("get_design_system");
      expect(toolNamesOf(onCalls[0])).toContain("check_page_design");
      expect(toolNamesOf(onCalls[0])).toContain("get_design_guide");
    });

    it("enforces action-level userAccess and delegatedPermissions (Library Page Editor clamp)", async () => {
      const calls = useScriptedModel();
      withChaiConfig({
        features: {
          ...getActiveChaiBuilderConfig().features,
          aiCredits: false,
          designSystem: { enabled: true, designChecks: "warn" },
        } as never,
      });

      // Library Page Editor permissions: ["ai:use", "ai:read"] — no pages:* / theme:* / assets:*
      await run(
        {
          messages: [userMessage("m1", "edit hero")],
          blocks: [{ _id: "b1", _type: "Box" }],
          pageId: "lib-1",
        },
        { userAccess: { role: "editor", permissions: ["ai:use", "ai:read"] } },
      );

      expect(toolNamesOf(calls[0])).toEqual([
        "add_blocks",
        "add_custom_block",
        "bind_prop",
        "edit_block",
        "read_block_html",
        "read_blocks",
        "remove_blocks",
        "update_block_props",
      ]);
      // Prompt omits sections whose tools are unavailable
      expect(systemOf(calls[0])).not.toContain("Call `get_pages_list`");
      expect(systemOf(calls[0])).not.toContain("get_partial_blocks");

      // Delegated permissions clamp further restricts granted permissions
      const clampedCalls = useScriptedModel();
      await run(
        {
          messages: [userMessage("m1", "edit hero")],
          blocks: [{ _id: "b1", _type: "Box" }],
          pageId: "p1",
        },
        {
          userAccess: {
            role: "admin",
            permissions: ["ai:use", "ai:read", "pages:read", "pages:update", "pages:edit_seo"],
          },
          delegatedPermissions: ["ai:use", "pages:read"],
        },
      );
      expect(toolNamesOf(clampedCalls[0])).toContain("get_pages_list");
      expect(toolNamesOf(clampedCalls[0])).toContain("get_page_seo");
      expect(toolNamesOf(clampedCalls[0])).not.toContain("update_page_seo");
    });

    it("preserves $-sequences in page outline copy without regex replacement expansion", async () => {
      const calls = useScriptedModel();
      await run({
        messages: [userMessage("m1", "hi")],
        blocks: [{ _id: "h1", _type: "Heading", tag: "h1", content: "Save $100 with $$ and $& promo" }],
      });
      expect(systemOf(calls[0])).toContain("Save $100 with $$ and $& promo");
    });
  });
});
