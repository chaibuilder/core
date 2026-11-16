/**
 * @vitest-environment happy-dom
 */
import { act, waitFor } from "@testing-library/react";
import { isPageLoadedAtom } from "~/builder/hooks/use-is-page-loaded";
import { registerChaiHook } from "~/builder/register-apis/register-chai-hooks";
import { CHAI_HOOKS } from "~/constants/CHAI_HOOKS";
import { renderHookInBuilder } from "~/tests/builder/render-in-builder";
import { builderSaveStateAtom, useSavePage } from "./use-save-page";

const afterSave = vi.fn((data: unknown) => data);
registerChaiHook(CHAI_HOOKS.AFTER_SAVE_PAGE, afterSave);

const renderSave = (onSave: () => Promise<unknown>, builderProps: Record<string, unknown> = {}) =>
  renderHookInBuilder(() => useSavePage(), {
    builderProps: { onSave, ...builderProps },
    seed: (store) => {
      store.set(builderSaveStateAtom, "UNSAVED");
      store.set(isPageLoadedAtom, true);
    },
  });

describe("savePageAsync", () => {
  beforeEach(() => {
    afterSave.mockClear();
  });

  it("reports a failed host save and keeps the changes pending, without after-save hooks", async () => {
    const { result, store } = renderSave(async () => false);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.savePageAsync();
    });

    expect(saved).toBe(false);
    expect(afterSave).not.toHaveBeenCalled();
    expect(store.get(builderSaveStateAtom)).toBe("UNSAVED");
  });

  it("reports a successful save, runs after-save hooks and marks the page saved", async () => {
    // A host onSave that returns nothing counts as saved.
    const { result, store } = renderSave(async () => undefined);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.savePageAsync();
    });

    expect(saved).toBe(true);
    expect(afterSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(store.get(builderSaveStateAtom)).toBe("SAVED"));
  });

  it.each([
    ["an ordinary save", false],
    ["a forced save", true],
  ])("saves nothing on a view-only page with changes pending: %s", async (_label, force) => {
    const onSave = vi.fn(async () => undefined);
    const { result, store } = renderSave(onSave, { readOnly: { reason: "Linked" } });

    await act(async () => {
      await result.current.savePageAsync(force);
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(store.get(builderSaveStateAtom)).toBe("UNSAVED");
  });
});
