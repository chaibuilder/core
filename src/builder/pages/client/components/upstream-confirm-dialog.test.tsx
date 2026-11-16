// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { UpstreamConfirmDialog } from "./upstream-confirm-dialog";

const renderDialog = (action: "clone" | "reset", builderProps: Record<string, unknown> = {}) =>
  renderInBuilder(<UpstreamConfirmDialog action={action} onConfirm={vi.fn()} onClose={vi.fn()} />, {
    builderProps,
  });

describe("UpstreamConfirmDialog", () => {
  it("names upstream pages by the host's label", async () => {
    renderDialog("reset", { labels: { features: { upstreamPage: "System Page" } } });

    expect(await screen.findByText("Reset to System Page?")).toBeTruthy();
    expect(screen.getByText(/shows the System Page again/)).toBeTruthy();
  });

  it("falls back to Upstream Page when the host names none", async () => {
    renderDialog("clone");

    expect(await screen.findByText(/The Upstream Page content is copied into this page/)).toBeTruthy();
  });
});
