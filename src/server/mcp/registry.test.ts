import { beforeEach, describe, expect, it } from "vitest";
import { createChaiMcpResponse } from "./response";
import {
  defineChaiMcpInstructionsSection,
  defineChaiMcpTool,
  getRegisteredChaiMcpInstructions,
  getRegisteredChaiMcpTool,
  getRegisteredChaiMcpTools,
  registerChaiMcpInstructions,
  registerChaiMcpTool,
  registerChaiMcpTools,
  resetChaiMcpRegistryForTests,
  unregisterChaiMcpTool,
  unregisterChaiMcpTools,
} from "./registry";

const tool = (name: string, permissions: string[] = []) =>
  defineChaiMcpTool({ name, kind: "read", description: name, inputSchema: {}, permissions }, async () =>
    createChaiMcpResponse(name),
  );

describe("MCP tool registry", () => {
  beforeEach(() => resetChaiMcpRegistryForTests());

  it("lists owners in first-registration order and tools in the owner's order", () => {
    registerChaiMcpTools("chai:mcp", [tool("create_page"), tool("publish_page")]);
    registerChaiMcpTools("app", [tool("list_leads")]);

    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page", "publish_page", "list_leads"]);
  });

  it("unregisters one tool and gives back its override claim", () => {
    registerChaiMcpTools("chai:mcp", [tool("create_page"), tool("publish_page")]);
    registerChaiMcpTool("app", tool("publish_page"), { override: true });
    registerChaiMcpTool("app", tool("list_leads"));

    unregisterChaiMcpTool("app", "publish_page");
    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page", "publish_page", "list_leads"]);

    unregisterChaiMcpTool("app", "list_leads");
    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page", "publish_page"]);
  });

  it("replaces an owner's previous set rather than appending to it", () => {
    registerChaiMcpTools("chai:mcp", [tool("create_page"), tool("publish_page")]);
    registerChaiMcpTools("chai:mcp", [tool("create_page")]);

    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page"]);
  });

  it("keeps a first-registration position when an owner re-registers", () => {
    registerChaiMcpTools("chai:mcp", [tool("create_page")]);
    registerChaiMcpTools("app", [tool("list_leads")]);
    registerChaiMcpTools("chai:mcp", [tool("create_page"), tool("publish_page")]);

    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page", "publish_page", "list_leads"]);
  });

  it("upserts a single tool without dropping the owner's others", () => {
    registerChaiMcpTools("app", [tool("a_tool"), tool("b_tool")]);
    registerChaiMcpTool("app", tool("a_tool", ["pages:read"]));

    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["b_tool", "a_tool"]);
    expect(getRegisteredChaiMcpTool("a_tool")?.permissions).toEqual(["pages:read"]);
  });

  it("refuses a name another owner already registered", () => {
    registerChaiMcpTools("chai:mcp", [tool("publish_page")]);

    expect(() => registerChaiMcpTools("app", [tool("publish_page")])).toThrow(/already owned by "chai:mcp"/);
    expect(getRegisteredChaiMcpTools()).toHaveLength(1);
  });

  it("lets an owner take over a name deliberately", () => {
    registerChaiMcpTools("chai:mcp", [tool("publish_page", ["pages:publish"])]);
    registerChaiMcpTools("app", [tool("publish_page", ["app:publish"])], { override: true });

    const tools = getRegisteredChaiMcpTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].permissions).toEqual(["app:publish"]);
  });

  it("refuses a duplicate within one registration", () => {
    expect(() => registerChaiMcpTools("app", [tool("a_tool"), tool("a_tool")])).toThrow(/twice/);
  });

  it("refuses an invalid tool name", () => {
    expect(() => registerChaiMcpTools("app", [tool("Create Page")])).toThrow(/invalid tool name/);
  });

  it("refuses a tool with no permissions array, so the gate cannot be bypassed", () => {
    const bad = { ...tool("a_tool"), permissions: undefined as unknown as string[] };
    expect(() => registerChaiMcpTools("app", [bad])).toThrow(/permissions array/);
  });

  it("drops an owner's tools on unregister", () => {
    registerChaiMcpTools("chai:mcp", [tool("create_page")]);
    registerChaiMcpTools("app", [tool("list_leads")]);
    unregisterChaiMcpTools("app");

    expect(getRegisteredChaiMcpTools().map((t) => t.name)).toEqual(["create_page"]);
  });
});

describe("MCP instructions registry", () => {
  beforeEach(() => resetChaiMcpRegistryForTests());

  it("sorts by order, then id, regardless of registration order", () => {
    registerChaiMcpInstructions("app", [defineChaiMcpInstructionsSection({ id: "leads", order: 200, body: "x" })]);
    registerChaiMcpInstructions("chai:mcp", [
      defineChaiMcpInstructionsSection({ id: "seo", order: 30, body: "x" }),
      defineChaiMcpInstructionsSection({ id: "preamble", order: 0, body: "x" }),
      defineChaiMcpInstructionsSection({ id: "alpha", order: 30, body: "x" }),
    ]);

    expect(getRegisteredChaiMcpInstructions().map((s) => s.id)).toEqual(["preamble", "alpha", "seo", "leads"]);
  });

  it("refuses an id another owner already registered", () => {
    registerChaiMcpInstructions("chai:mcp", [defineChaiMcpInstructionsSection({ id: "seo", order: 30, body: "x" })]);

    expect(() =>
      registerChaiMcpInstructions("app", [defineChaiMcpInstructionsSection({ id: "seo", order: 31, body: "y" })]),
    ).toThrow(/already owned by "chai:mcp"/);
  });
});
