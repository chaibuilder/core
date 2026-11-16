// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectedLanguageAtom } from "~/builder/hooks/use-languages";
import { requestChaiPanelClose } from "~/builder/hooks/use-panel-close-guard";
import { ACTIONS } from "~/builder/pages/constants/ACTIONS";
import { CHAI_SLOT_IDS, registerChaiSlot } from "~/builder/register-apis";
import { TooltipProvider } from "~/components/ui/tooltip";
import { mockChaiAction } from "~/tests/builder/msw";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import SeoPanel from "./seo-panel";

type Seo = Record<string, unknown>;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stands in for the pro AI generate button, registered through the real slot API: clicking it
// applies a generated value.
registerChaiSlot(
  CHAI_SLOT_IDS.SEO_FIELD_ACTIONS,
  ({ field, onApply }: { field?: string; onApply?: (value: string) => void }) =>
    field ? (
      <button type="button" data-testid={`generate-${field}`} onClick={() => onApply?.(`AI ${field}`)}>
        generate
      </button>
    ) : null,
);

/** What the server holds for each language page; GET_LANGUAGE_PAGES reads it on every (re)fetch. */
const server = {
  seo: {} as Seo,
  esSeo: {} as Seo,
};

type PendingSave = { seo: Seo; resolve: (options?: { persist?: boolean }) => void };

/**
 * Answers the page-scoped actions the panel loads on `?page=page-1`, and holds every UPDATE_PAGE
 * open until the test resolves it — that gap is where the hydration race lives.
 */
const mockPageServer = () => {
  mockChaiAction(ACTIONS.GET_WEBSITE_PAGES, [{ id: "page-1", name: "Home", slug: "/", pageType: "page" }]);
  mockChaiAction(ACTIONS.GET_PAGE_TYPES, [{ key: "page", name: "Page", hasSlug: true }]);
  mockChaiAction(ACTIONS.GET_BUILDER_PAGE_DATA, {});
  mockChaiAction(ACTIONS.GET_SITE_GLOBAL_DATA, {});
  mockChaiAction(ACTIONS.GET_WEBSITE_DRAFT_SETTINGS, { languages: ["es"], fallbackLang: "en", appChanges: [] });
  const languagePages = mockChaiAction(ACTIONS.GET_LANGUAGE_PAGES, () => [
    { id: "lang-page-en", name: "Home (en)", slug: "/", lang: "", primaryPage: null, seo: server.seo },
    { id: "lang-page-es", name: "Inicio (es)", slug: "/es", lang: "es", primaryPage: "page-1", seo: server.esSeo },
  ]);
  const saves: PendingSave[] = [];
  const updatePage = mockChaiAction(
    ACTIONS.UPDATE_PAGE,
    (data) =>
      new Promise((resolve) => {
        saves.push({
          seo: data.seo,
          resolve: ({ persist = true } = {}) => {
            if (persist) server.seo = data.seo;
            resolve({ id: data.id });
          },
        });
      }),
  );
  return { languagePages, updatePage, saves };
};

/** Renders the real panel and waits until it has hydrated from the language page. */
const renderPanel = async () => {
  const mocks = mockPageServer();
  // The builder shell provides the tooltip context the panel's field pickers use.
  const rendered = renderInBuilder(
    <TooltipProvider>
      <SeoPanel />
    </TooltipProvider>,
    {
      // Plain inputs rather than the binding editor, as for a host without data binding.
      builderProps: { fallbackLang: "en", languages: ["en", "es"], flags: { dataBinding: false } },
    },
  );
  await screen.findByText("Home (en)");
  await waitFor(() => expect(rendered.queryClient.isFetching()).toBe(0));
  await act(async () => {});
  return { ...rendered, ...mocks };
};

/** Resolves a held save and waits for the refetch its invalidation triggers to land. */
const resolveSave = async (
  mocks: Awaited<ReturnType<typeof renderPanel>>,
  save: PendingSave | undefined,
  options?: { persist?: boolean },
) => {
  const refetchesBefore = mocks.languagePages.calls.length;
  await act(async () => save?.resolve(options));
  await waitFor(() => expect(mocks.languagePages.calls.length).toBeGreaterThan(refetchesBefore));
  await waitFor(() => expect(mocks.queryClient.isFetching()).toBe(0));
  await act(async () => {});
};

const seoTitleInput = () => document.getElementById("title") as HTMLInputElement;
const seoDescriptionInput = () => document.getElementById("description") as HTMLTextAreaElement;
const ogTitleInput = () => document.getElementById("ogTitle") as HTMLInputElement;

const generate = (field: string) => fireEvent.click(screen.getByTestId(`generate-${field}`));
const saveButton = () => screen.getByRole("button", { name: "Save" });
const type = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const unsavedDialog = () => screen.queryByText("Unsaved SEO Changes");

// A page whose JSON-LD has been saved as an empty object. (A page with no JSON-LD at all is
// covered by the close-guard case below.)
const EMPTY_SEO: Seo = { title: "", description: "", jsonLD: "{}" };

beforeEach(() => {
  window.history.replaceState({}, "", "/?page=page-1");
  server.seo = { ...EMPTY_SEO };
  server.esSeo = { ...EMPTY_SEO };
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("SeoPanel saving", () => {
  it("does not save until Save is clicked", async () => {
    const { updatePage } = await renderPanel();

    type(seoTitleInput(), "Edited title");
    await act(async () => {});
    expect(updatePage.calls).toHaveLength(0);

    fireEvent.click(saveButton());
    await waitFor(() => expect(updatePage.calls).toHaveLength(1));
    expect(updatePage.calls[0]?.seo.title).toBe("Edited title");
  });

  it("keeps edits made on other tabs and saves them together", async () => {
    const { updatePage } = await renderPanel();

    type(seoTitleInput(), "Edited title");
    fireEvent.click(screen.getByRole("tab", { name: "Meta Tags" }));
    type(ogTitleInput(), "Edited OG title");

    // Switching back shows the earlier edit — no tab unmounts the form.
    fireEvent.click(screen.getByRole("tab", { name: "SEO" }));
    expect(seoTitleInput().value).toBe("Edited title");

    fireEvent.click(saveButton());
    await waitFor(() => expect(updatePage.calls).toHaveLength(1));
    expect(updatePage.calls[0]?.seo).toMatchObject({ title: "Edited title", ogTitle: "Edited OG title" });
  });

  it("toasts and disables Save once the save succeeds", async () => {
    const mocks = await renderPanel();

    type(seoTitleInput(), "Edited title");
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saves).toHaveLength(1));
    expect(toast.success).not.toHaveBeenCalled();

    await resolveSave(mocks, mocks.saves.at(-1));

    expect(toast.success).toHaveBeenCalledWith("SEO & JSON-LD updated successfully");
    expect(saveButton()).toHaveProperty("disabled", true);
    expect(seoTitleInput().value).toBe("Edited title");
  });

  it("toasts on a failed save and keeps the edits", async () => {
    await renderPanel();
    mockChaiAction(ACTIONS.UPDATE_PAGE, { message: "nope", code: "INTERNAL_ERROR", status: 500 }, { ok: false });
    vi.spyOn(console, "error").mockImplementation(() => {});

    type(seoTitleInput(), "Edited title");
    fireEvent.click(saveButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update SEO & JSON-LD"));
    expect(seoTitleInput().value).toBe("Edited title");
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", false));
    vi.mocked(console.error).mockRestore();
  });
});

describe("SeoPanel close guard", () => {
  it("closes straight away with no unsaved changes", async () => {
    await renderPanel();

    const proceed = vi.fn();
    act(() => requestChaiPanelClose("seo", proceed));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(unsavedDialog()).toBeNull();
  });

  // SmartJsonInput normalises an empty JSON-LD to "{}" on mount; hydration must match or the panel
  // opens dirty for a page whose SEO has no JSON-LD (getSeoDefaults' default).
  it("closes straight away when the page has no JSON-LD and nothing was edited", async () => {
    server.seo = { title: "", description: "" };
    await renderPanel();

    const proceed = vi.fn();
    act(() => requestChaiPanelClose("seo", proceed));

    expect(proceed).toHaveBeenCalledTimes(1);
    expect(unsavedDialog()).toBeNull();
    expect(saveButton()).toHaveProperty("disabled", true);
  });

  it("warns instead of closing when there are unsaved changes", async () => {
    await renderPanel();

    type(seoTitleInput(), "Edited title");

    const proceed = vi.fn();
    act(() => requestChaiPanelClose("seo", proceed));

    expect(proceed).not.toHaveBeenCalled();
    expect(await screen.findByText("Unsaved SEO Changes")).toBeTruthy();
  });

  it("saves then closes when the warning is accepted", async () => {
    const mocks = await renderPanel();

    type(seoTitleInput(), "Edited title");
    const proceed = vi.fn();
    act(() => requestChaiPanelClose("seo", proceed));

    fireEvent.click(await screen.findByRole("button", { name: "Save & Close" }));
    await waitFor(() => expect(mocks.saves).toHaveLength(1));
    expect(mocks.saves.at(-1)?.seo.title).toBe("Edited title");
    // Still open — the panel closes only once the save comes back.
    expect(proceed).not.toHaveBeenCalled();

    await resolveSave(mocks, mocks.saves.at(-1));

    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it("restores the saved values and closes on discard", async () => {
    const { updatePage } = await renderPanel();

    type(seoTitleInput(), "Edited title");
    const proceed = vi.fn();
    act(() => requestChaiPanelClose("seo", proceed));

    fireEvent.click(await screen.findByRole("button", { name: "Discard Changes" }));
    await act(async () => {});

    expect(updatePage.calls).toHaveLength(0);
    expect(seoTitleInput().value).toBe("");
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});

describe("SeoPanel server hydration", () => {
  it("keeps a field generated while an earlier save is in flight", async () => {
    const mocks = await renderPanel();

    generate("title");
    expect(seoTitleInput().value).toBe("AI title");
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.saves).toHaveLength(1));
    const titleSave = mocks.saves.at(-1);
    expect(titleSave?.seo.title).toBe("AI title");

    // Description is generated before the title's save has come back.
    generate("description");
    expect(seoDescriptionInput().value).toBe("AI description");

    // The title save resolves and its invalidation refetches the page — the server row
    // only knows about the title.
    server.seo = { ...EMPTY_SEO, title: "AI title" };
    await resolveSave(mocks, titleSave, { persist: false });

    expect(seoTitleInput().value).toBe("AI title");
    expect(seoDescriptionInput().value).toBe("AI description");
  });

  it("takes server values on a refetch with no unsaved edits", async () => {
    const { queryClient, languagePages } = await renderPanel();

    server.seo = {
      ...EMPTY_SEO,
      title: "Title from another editor",
      description: "Description from another editor",
    };
    const fetchesBefore = languagePages.calls.length;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: [ACTIONS.GET_LANGUAGE_PAGES] });
    });
    expect(languagePages.calls.length).toBeGreaterThan(fetchesBefore);

    await waitFor(() => expect(seoTitleInput().value).toBe("Title from another editor"));
    expect(seoDescriptionInput().value).toBe("Description from another editor");
  });

  it("takes server values when the language changes, even with unsaved edits", async () => {
    server.esSeo = { ...EMPTY_SEO, title: "Título", description: "Descripción" };
    const { store } = await renderPanel();

    generate("title");
    expect(seoTitleInput().value).toBe("AI title");

    act(() => store.set(selectedLanguageAtom, "es"));

    await waitFor(() => expect(seoTitleInput().value).toBe("Título"));
    expect(seoDescriptionInput().value).toBe("Descripción");
  });
});

describe("SeoPanel on a view-only page", () => {
  it("shows the SEO the page renders, not its stored SEO", async () => {
    server.seo = { ...EMPTY_SEO, title: "Stored title" };
    mockPageServer();
    // A linked page's draft is its upstream page's content.
    mockChaiAction(ACTIONS.GET_PAGE_ALL_DATA, () => ({
      draftPage: { id: "page-1", seo: { ...EMPTY_SEO, title: "Upstream title" } },
      builderPageData: {},
      siteGlobalData: {},
      languagePages: [
        { id: "lang-page-en", name: "Home (en)", slug: "/", lang: "", primaryPage: null, seo: server.seo },
      ],
    }));

    renderInBuilder(
      <TooltipProvider>
        <SeoPanel />
      </TooltipProvider>,
      {
        builderProps: {
          fallbackLang: "en",
          languages: ["en"],
          flags: { dataBinding: false },
          readOnly: { reason: "Linked" },
        },
      },
    );

    await waitFor(() => expect(seoTitleInput().value).toBe("Upstream title"));
  });
});
