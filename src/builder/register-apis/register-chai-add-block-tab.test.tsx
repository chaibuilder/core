/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import { CHAI_ADD_BLOCK_TABS, registerChaiAddBlockTab, useChaiAddBlockTabs } from "./register-chai-add-block-tab";

describe("add-block-tabs", () => {
  beforeEach(() => {
    // Clear the ADD_BLOCK_TABS object before each test
    Object.keys(CHAI_ADD_BLOCK_TABS).forEach((key) => {
      delete CHAI_ADD_BLOCK_TABS[key];
    });

    // Mock console.warn
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerChaiAddBlockTab", () => {
    it("should register a new add block tab", () => {
      // Mock components
      const MockTab = () => <div>Tab</div>;
      const MockTabContent = () => <div>Tab Content</div>;

      // Register a tab
      registerChaiAddBlockTab("test-tab", {
        tab: MockTab,
        tabContent: MockTabContent,
      });

      // Check if tab is registered
      expect(CHAI_ADD_BLOCK_TABS["test-tab"]).toBeDefined();
      expect(CHAI_ADD_BLOCK_TABS["test-tab"].id).toBe("test-tab");
      expect(CHAI_ADD_BLOCK_TABS["test-tab"].tab).toBe(MockTab);
      expect(CHAI_ADD_BLOCK_TABS["test-tab"].tabContent).toBe(MockTabContent);
    });

    it("should warn when registering a tab with an existing id", () => {
      // Mock components
      const MockTab = () => <div>Tab</div>;
      const MockTabContent = () => <div>Tab Content</div>;

      // Register a tab
      registerChaiAddBlockTab("duplicate-tab", {
        tab: MockTab,
        tabContent: MockTabContent,
      });

      // Register another tab with the same id
      registerChaiAddBlockTab("duplicate-tab", {
        tab: MockTab,
        tabContent: MockTabContent,
      });

      // Check if warning was called
      expect(console.warn).toHaveBeenCalledWith("Add block tab with id duplicate-tab already registered");
    });
  });

  describe("useChaiAddBlockTabs", () => {
    it("should return all registered tabs", () => {
      // Mock components
      const MockTab1 = () => <div>Tab 1</div>;
      const MockTabContent1 = () => <div>Tab Content 1</div>;
      const MockTab2 = () => <div>Tab 2</div>;
      const MockTabContent2 = () => <div>Tab Content 2</div>;

      // Register tabs
      registerChaiAddBlockTab("tab-1", {
        tab: MockTab1,
        tabContent: MockTabContent1,
      });

      registerChaiAddBlockTab("tab-2", {
        tab: MockTab2,
        tabContent: MockTabContent2,
      });

      // Use the hook
      const { result } = renderHook(() => useChaiAddBlockTabs());

      // Check if tabs are returned
      expect(result.current).toHaveLength(2);
      expect(result.current.map((tab) => tab.id)).toContain("tab-1");
      expect(result.current.map((tab) => tab.id)).toContain("tab-2");
    });

    it("should return an empty array if no tabs are registered", () => {
      // Use the hook
      const { result } = renderHook(() => useChaiAddBlockTabs());

      // Check if an empty array is returned
      expect(result.current).toHaveLength(0);
    });
  });
});
