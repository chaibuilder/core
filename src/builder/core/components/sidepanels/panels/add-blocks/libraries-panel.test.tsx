// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerChaiLibrary } from "~/builder/register-apis";
import { registerChaiBlock } from "~/registry";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import UILibrariesPanel, { isRegisteredLibraryBlockDisabled } from "./libraries-panel";

const getBlock = vi.fn(async () => []);

registerChaiLibrary("lib-a", {
  name: "Library A",
  description: "",
  getBlocksList: async () => [
    { id: "a1", name: "Hero A", group: "hero" },
    { id: "a2", name: "Footer A", group: "footer" },
  ],
  getBlock,
});

const Noop = () => null;
registerChaiBlock(Noop, { type: "LibTestParent", label: "Parent", group: "test", canAcceptBlock: () => false });
registerChaiBlock(Noop, { type: "LibTestOpenParent", label: "Open", group: "test", canAcceptBlock: () => true });

const registered = { id: "LibTestChild", type: "LibTestChild", name: "Child", group: "test", component: Noop };
const uiLibraryBlock = { id: "hero-1", type: "LibTestChild", name: "Hero", group: "hero" };

describe("isRegisteredLibraryBlockDisabled", () => {
  it("disables a registered block under a parent that rejects it when drag-and-drop is off", () => {
    expect(isRegisteredLibraryBlockDisabled(registered, "LibTestParent", false)).toBe(true);
  });

  it("allows it under a parent that accepts it, or at the root", () => {
    expect(isRegisteredLibraryBlockDisabled(registered, "LibTestOpenParent", false)).toBe(false);
    expect(isRegisteredLibraryBlockDisabled(registered, undefined, false)).toBe(false);
  });

  it("never disables when drag-and-drop is on", () => {
    expect(isRegisteredLibraryBlockDisabled(registered, "LibTestParent", true)).toBe(false);
  });

  it("leaves UI library blocks alone", () => {
    expect(isRegisteredLibraryBlockDisabled(uiLibraryBlock, "LibTestParent", false)).toBe(false);
  });
});

describe("UILibrariesPanel group selection", () => {
  const selectedGroupLabel = () => screen.getByText(/^(Hero|Footer)$/, { selector: ".bg-primary span" }).textContent;

  beforeEach(() => {
    localStorage.clear();
  });

  it("opens on the first group A-Z and keeps the picked group when the panel is reopened", async () => {
    const first = renderInBuilder(<UILibrariesPanel />);
    await screen.findByText("Footer A");
    expect(selectedGroupLabel()).toBe("Footer");
    fireEvent.click(screen.getByText("Hero"));
    expect(selectedGroupLabel()).toBe("Hero");
    first.unmount();

    renderInBuilder(<UILibrariesPanel />);
    expect(selectedGroupLabel()).toBe("Hero");
    expect(screen.getByText("Hero A")).toBeTruthy();
  });

  it("lists groups A-Z in the Add Block hover list", async () => {
    renderInBuilder(<UILibrariesPanel />);
    await screen.findByText(/^(Hero|Footer) A$/);
    const labels = screen.getAllByText(/^(Hero|Footer)$/, { selector: "[role=button] span" }).map((el) => el.textContent);
    expect(labels).toEqual(["Footer", "Hero"]);
  });

  it("lists groups A-Z in the sidebar dropdown", async () => {
    renderInBuilder(<UILibrariesPanel fromSidebar />);
    await screen.findByText(/^(Hero|Footer) A$/);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    const labels = screen.getAllByRole("option").map((el) => el.textContent);
    expect(labels).toEqual(["Footer", "Hero"]);
  });
});

describe("UILibrariesPanel card insertion", () => {
  beforeEach(() => {
    localStorage.clear();
    getBlock.mockClear();
  });

  it("does not insert a block when its preview is clicked", async () => {
    renderInBuilder(<UILibrariesPanel />);
    fireEvent.click(await screen.findByText("Footer A"));
    expect(getBlock).not.toHaveBeenCalled();
  });

  it("inserts the block when its Add button is clicked", async () => {
    renderInBuilder(<UILibrariesPanel />);
    await screen.findByText("Footer A");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(getBlock).toHaveBeenCalledTimes(1));
  });
});
