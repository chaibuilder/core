import { describe, expect, it, vi } from "vitest";

// Next.js builds a module graph per route, so a plugin's request middleware can be registered from
// another graph's copy of this module than the one that started the request.
describe("request state across module copies", () => {
  it("is visible to a second copy of the module during the request", async () => {
    const first = await import("./state");
    vi.resetModules();
    const second = await import("./state");
    expect(second).not.toBe(first);

    const appId = first.runInContext({ appId: "site-a" }, () => second.getInitializedState().appId);

    expect(appId).toBe("site-a");
  });
});
