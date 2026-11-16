/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { isMacPlatform } from "./help-panel";

const setPlatform = (userAgentDataPlatform: string | undefined, platform: string) => {
  Object.defineProperty(navigator, "userAgentData", {
    value: userAgentDataPlatform ? { platform: userAgentDataPlatform } : undefined,
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
};

// The modifier key is computed when help-panel loads, so each case loads a fresh module graph. The
// fresh react-i18next instance is initialised with the English bundle the same way the builder does.
const renderPanel = async () => {
  vi.resetModules();
  await import("~/builder/core/locales/load");
  const { helpPanel } = await import("./help-panel");
  const Panel = helpPanel.panel;
  render(<Panel />);
};

describe("isMacPlatform", () => {
  it("detects the platform strings Chromium reports via userAgentData", () => {
    expect(isMacPlatform("macOS")).toBe(true);
    expect(isMacPlatform("iOS")).toBe(true);
  });

  it("detects the platform strings navigator.platform reports", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("iPhone")).toBe(true);
    expect(isMacPlatform("iPad")).toBe(true);
  });

  it("does not match non-Apple platforms", () => {
    expect(isMacPlatform("Windows")).toBe(false);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
    expect(isMacPlatform("Chromium OS")).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});

describe("HelpPanel modifier key", () => {
  it("shows ⌘ on Chromium for macOS, which reports userAgentData.platform as 'macOS'", async () => {
    setPlatform("macOS", "MacIntel");
    await renderPanel();

    expect(screen.getAllByText("⌘").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ctrl")).toBeNull();
  });

  it("shows ⌘ on Safari for macOS, which has no userAgentData", async () => {
    setPlatform(undefined, "MacIntel");
    await renderPanel();

    expect(screen.getAllByText("⌘").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ctrl")).toBeNull();
  });

  it("shows Ctrl on Windows", async () => {
    setPlatform("Windows", "Win32");
    await renderPanel();

    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(screen.queryByText("⌘")).toBeNull();
  });
});
