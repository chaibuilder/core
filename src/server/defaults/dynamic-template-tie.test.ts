import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetActiveChaiBuilderConfigForTests,
  resolveConfigDynamicTemplateTie,
} from "~/server/defaults/config-registry";

const candidates = [
  { slug: "/auto-usage", pageType: "vdp_page" },
  { slug: "/auto-usage", pageType: "inventory_make_listing" },
];

describe("resolveConfigDynamicTemplateTie", () => {
  beforeEach(() => {
    resetActiveChaiBuilderConfigForTests();
  });

  it("returns the first candidate (registration-order default) when no handler is configured", async () => {
    expect(await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/vus-moins-de-17000")).toBe(candidates[0]);
  });

  it("returns undefined for an empty candidate set", async () => {
    expect(await resolveConfigDynamicTemplateTie([], "/auto-usage/anything")).toBeUndefined();
  });

  it("does not invoke the handler when fewer than two candidates compete", async () => {
    const handler = vi.fn(async () => undefined);
    resetActiveChaiBuilderConfigForTests({ resolveDynamicTemplateTie: handler });

    const single = [candidates[0]];
    expect(await resolveConfigDynamicTemplateTie(single, "/auto-usage/2022-honda-civic-abc")).toBe(single[0]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("adopts the candidate chosen by the handler", async () => {
    resetActiveChaiBuilderConfigForTests({
      resolveDynamicTemplateTie: async (cands) => cands.find((c) => c.pageType === "inventory_make_listing"),
    });

    expect(await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/vus-moins-de-17000")).toBe(candidates[1]);
  });

  it("passes the competing candidates and slug to the handler", async () => {
    const handler = vi.fn(async () => undefined);
    resetActiveChaiBuilderConfigForTests({ resolveDynamicTemplateTie: handler });

    await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/vus-moins-de-17000");

    expect(handler).toHaveBeenCalledWith(candidates, "/auto-usage/vus-moins-de-17000");
  });

  it("falls back to the default when the handler declines (undefined)", async () => {
    resetActiveChaiBuilderConfigForTests({ resolveDynamicTemplateTie: async () => undefined });

    expect(await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/hyundai-kona-2022-r0866a")).toBe(
      candidates[0],
    );
  });

  it("ignores a return value that is not one of the candidates", async () => {
    resetActiveChaiBuilderConfigForTests({
      // Deliberately outside the candidate set — that is what this case exercises, so the
      // handler cannot satisfy the generic candidate return type.
      resolveDynamicTemplateTie: (async () => ({ slug: "/elsewhere", pageType: "page" })) as any,
    });

    expect(await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/vus-moins-de-17000")).toBe(candidates[0]);
  });

  it("degrades to the default when the handler throws", async () => {
    resetActiveChaiBuilderConfigForTests({
      resolveDynamicTemplateTie: async () => {
        throw new Error("firestore unreachable");
      },
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await resolveConfigDynamicTemplateTie(candidates, "/auto-usage/vus-moins-de-17000")).toBe(candidates[0]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
