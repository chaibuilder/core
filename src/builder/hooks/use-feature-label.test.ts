// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resolveFeatureLabel } from "./use-feature-label";

describe("resolveFeatureLabel", () => {
  it("uses the host's name", () => {
    expect(resolveFeatureLabel({ features: { upstreamPage: "System Page" } }, "upstreamPage", "en", "en")).toBe(
      "System Page",
    );
  });

  it("picks the locale's name, then the language's, then English", () => {
    const labels = { features: { upstreamPage: { fr: "Page système", de: "Systemseite", en: "System Page" } } };
    expect(resolveFeatureLabel(labels, "upstreamPage", "fr", "de")).toBe("Page système");
    expect(resolveFeatureLabel(labels, "upstreamPage", "es", "de")).toBe("Systemseite");
    expect(resolveFeatureLabel(labels, "upstreamPage", "es", "it")).toBe("System Page");
  });

  it("falls back to the default name", () => {
    expect(resolveFeatureLabel(undefined, "upstreamPage", "en", "en")).toBe("Upstream Page");
  });
});
