/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/react";
import { ComponentType } from "react";
import {
  CHAI_BUILDER_PANELS,
  registerChaiSidebarPanel,
  useChaiSidebarPanels,
} from "~/builder/register-apis/register-chai-sidebar-panel";
import {
  CHAI_SIDEBAR_PANEL_ORDER,
  CHAI_SIDEBAR_PANEL_DEFAULT_ORDER,
} from "~/builder/register-apis/sidebar-panel-order";

describe("registerChaiSidebarPanel", () => {
  beforeEach(() => {
    // Clear registry before each test - much simpler with direct access
    Object.keys(CHAI_BUILDER_PANELS).forEach((key) => {
      delete CHAI_BUILDER_PANELS[key];
    });

    // Spy on console.warn
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should register a panel successfully", () => {
    // Mock components
    const MockButton = () => <div>Test Button</div>;
    const MockPanel = () => <div>Test Panel</div>;

    // Mock panel options
    const panelOptions = {
      position: "top" as const,
      button: MockButton,
      label: "Test Panel",
      panel: MockPanel as ComponentType,
    };

    // Register panel
    registerChaiSidebarPanel("test-panel", panelOptions);

    // Direct check of the internal registry
    expect(Object.keys(CHAI_BUILDER_PANELS)).toHaveLength(1);
    expect(CHAI_BUILDER_PANELS["test-panel"]).toMatchObject({
      id: "test-panel",
      position: "top",
      label: "Test Panel",
    });
  });

  it("should warn when registering a panel with an existing ID and override it", () => {
    // First register a panel
    const FirstButton = () => <div>Original Button</div>;
    const FirstPanel = () => <div>Original Panel</div>;
    registerChaiSidebarPanel("duplicate-panel", {
      position: "top",
      button: FirstButton,
      label: "Original Panel",
      panel: FirstPanel as ComponentType,
    });

    // Then register another panel with the same ID but different position
    const SecondButton = () => <div>Override Button</div>;
    const SecondPanel = () => <div>Override Panel</div>;
    registerChaiSidebarPanel("duplicate-panel", {
      position: "bottom",
      button: SecondButton,
      label: "Override Panel",
      panel: SecondPanel as ComponentType,
    });

    // Check if warning was logged
    expect(console.warn).toHaveBeenCalledWith("Panel duplicate-panel already registered. Overriding...");

    // Direct verification of the internal state
    expect(CHAI_BUILDER_PANELS["duplicate-panel"]).toMatchObject({
      id: "duplicate-panel",
      position: "bottom",
      label: "Override Panel",
    });
  });

  it("should respect optional panel properties", () => {
    // Mock components
    const MockButton = () => <div>Optional Props Button</div>;
    const MockPanel = () => <div>Optional Props Panel</div>;

    // Register panel with optional properties
    registerChaiSidebarPanel("optional-props-panel", {
      position: "bottom",
      button: MockButton,
      label: "Optional Props Panel",
      panel: MockPanel as ComponentType,
      view: "modal",
      width: 400,
      isInternal: true,
    });

    // Direct access to the registered panel
    const panel = CHAI_BUILDER_PANELS["optional-props-panel"];

    // Verify all properties
    expect(panel).toBeDefined();
    expect(panel).toMatchObject({
      id: "optional-props-panel",
      position: "bottom",
      label: "Optional Props Panel",
      view: "modal",
      width: 400,
      isInternal: true,
    });
  });

  it("should default the order of a panel registered without one", () => {
    const MockButton = () => <div>Unordered Button</div>;
    registerChaiSidebarPanel("unordered-panel", { position: "top", button: MockButton, label: "Unordered" });

    expect(CHAI_BUILDER_PANELS["unordered-panel"].order).toBe(CHAI_SIDEBAR_PANEL_DEFAULT_ORDER);
  });

  it("should pin fixed panels regardless of the order passed in", () => {
    const MockButton = () => <div>Button</div>;
    registerChaiSidebarPanel("logout", { position: "bottom", button: MockButton, label: "Logout", order: 1 });
    registerChaiSidebarPanel("outline", { position: "top", button: MockButton, label: "Outline", order: 999 });

    expect(CHAI_BUILDER_PANELS["logout"].order).toBe(CHAI_SIDEBAR_PANEL_ORDER.LOGOUT);
    expect(CHAI_BUILDER_PANELS["outline"].order).toBe(CHAI_SIDEBAR_PANEL_ORDER.OUTLINE);
  });
});

describe("useChaiSidebarPanels", () => {
  const MockButton = () => <div>Button</div>;

  beforeEach(() => {
    Object.keys(CHAI_BUILDER_PANELS).forEach((key) => {
      delete CHAI_BUILDER_PANELS[key];
    });
  });

  const register = (id: string, position: "top" | "bottom", order?: number) =>
    registerChaiSidebarPanel(id, { position, button: MockButton, label: id, order });

  it("should sort by order and only return the requested position", () => {
    register("third", "top", 30);
    register("first", "top", 10);
    register("bottom-panel", "bottom", 10);
    register("second", "top", 20);

    const { result } = renderHook(() => useChaiSidebarPanels("top"));

    expect(result.current.map((panel) => panel.id)).toEqual(["first", "second", "third"]);
  });

  it("should keep registration order for panels sharing an order", () => {
    register("b", "top", 10);
    register("a", "top", 10);

    const { result } = renderHook(() => useChaiSidebarPanels("top"));

    expect(result.current.map((panel) => panel.id)).toEqual(["b", "a"]);
  });

  it("should keep logout last no matter when it registers", () => {
    // Registered first, before the panels it must sit below — this is the ordering
    // bug the fixed order guards against, since logout registers from its own module.
    register("logout", "bottom");
    register("help", "bottom", CHAI_SIDEBAR_PANEL_ORDER.HELP);
    register("trash", "bottom", CHAI_SIDEBAR_PANEL_ORDER.TRASH);
    register("user-info", "bottom", CHAI_SIDEBAR_PANEL_ORDER.USER_INFO);

    const { result } = renderHook(() => useChaiSidebarPanels("bottom"));

    expect(result.current.map((panel) => panel.id)).toEqual(["help", "trash", "user-info", "logout"]);
  });
});
