import { getChaiFontStyles, registerChaiFont } from "~/registry";

const face = (url: string, fontWeight: string, fontStyle = "normal") => ({
  url,
  format: "woff2",
  fontWeight,
  fontStyle,
});

describe("getFontStyles preloads", () => {
  it("ranks weights per family and preloads a variable font file once", async () => {
    registerChaiFont("Static", {
      fallback: "sans-serif",
      src: [
        face("/s-500", "500"),
        face("/s-700", "bold"),
        face("/s-400i", "normal", "italic"),
        face("/s-600", "600"),
        face("/s-400", "normal"),
        face("/s-300", "300"),
      ],
    });
    registerChaiFont("Variable", { fallback: "sans-serif", src: [face("/v", "100 900")] });
    registerChaiFont("Variable Alias", { fallback: "sans-serif", src: [face("/v", "100 900")] });
    const preloads = async (heading: string, body: string) => (await getChaiFontStyles(heading, body)).preloads;

    // Heading and body share a family: four weights.
    expect(await preloads("Static", "Static")).toEqual(["/s-400", "/s-700", "/s-600", "/s-500"]);
    // Two families: two weights each; a variable font is one file.
    expect(await preloads("Static", "Variable")).toEqual(["/s-400", "/s-700", "/v"]);
    // A system font has no file, so the other family gets the whole budget.
    expect(await preloads("Arial", "Static")).toEqual(["/s-400", "/s-700", "/s-600", "/s-500"]);
    // The same file is preloaded once.
    expect(await preloads("Variable", "Variable Alias")).toEqual(["/v"]);
  });
});

describe("getFontStyles Google Fonts fallback", () => {
  const sans = "ui-sans-serif, system-ui, sans-serif";

  it("imports an unregistered font from Google Fonts before any @font-face", async () => {
    registerChaiFont("Local", { fallback: "sans-serif", src: [face("/l", "400")] });
    const { fontStyles, preloads } = await getChaiFontStyles("Figtree", "Local");
    const url = "https://fonts.googleapis.com/css?family=Figtree:300,400,500,600,700,800&display=swap";
    expect(fontStyles.startsWith(`@import url("${url}");`)).toBe(true);
    expect(fontStyles.indexOf("@import")).toBeLessThan(fontStyles.indexOf("@font-face"));
    expect(preloads).toEqual(["/l"]);
  });

  it("encodes spaces as +", async () => {
    const { fontStyles } = await getChaiFontStyles("Work Sans", "Work Sans");
    expect(fontStyles).toBe(
      `@import url("https://fonts.googleapis.com/css?family=Work+Sans:300,400,500,600,700,800&display=swap");`,
    );
  });

  it("leaves registered fonts without an @import", async () => {
    registerChaiFont("Registered", { fallback: sans, src: [face("/r", "400")] });
    const { fontStyles } = await getChaiFontStyles("Registered", "Arial");
    expect(fontStyles).not.toContain("@import");
    expect(fontStyles).toContain('font-family: "Registered"');
  });

  it.each([sans, "serif", 'Evil"; } <x>', "a}b"])("does not import %s", async (family) => {
    expect((await getChaiFontStyles(family, family)).fontStyles).not.toContain("@import");
  });

  it("emits nothing for an empty family", async () => {
    expect((await getChaiFontStyles("", "")).fontStyles).toBe("");
  });
});
