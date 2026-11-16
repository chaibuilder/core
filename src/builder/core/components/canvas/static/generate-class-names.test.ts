import { generateClassNames } from "./new-blocks-render-helpers";

describe("generateClassNames — stopless gradient sanitation", () => {
  it("strips a stopless gradient direction so the solid bg survives the cnfast merge", () => {
    // A gradient direction with no from-*/to-* stops is transparent; without
    // sanitation cnfast would let it evict `bg-primary` and blank the element.
    const out = generateClassNames("#styles:,bg-primary bg-gradient-to-r bg-[length:200%_200%]", {});
    expect(out.split(/\s+/)).toContain("bg-primary");
    expect(out).not.toContain("bg-gradient-to-r");
  });

  it("keeps a base solid class when the user override adds only a stopless direction", () => {
    const out = generateClassNames("#styles:bg-secondary,bg-gradient-to-r", {});
    expect(out.split(/\s+/)).toContain("bg-secondary");
    expect(out).not.toContain("bg-gradient-to-r");
  });

  it("keeps a genuine gradient that defines color stops", () => {
    const out = generateClassNames("#styles:,bg-gradient-to-r from-red-500 to-blue-500", {});
    expect(out).toContain("bg-gradient-to-r");
    expect(out).toContain("from-red-500");
    expect(out).toContain("to-blue-500");
  });

  it("keeps a responsive gradient with its own stops while dropping a stopless base direction", () => {
    const out = generateClassNames(
      "#styles:,bg-gradient-to-r md:bg-gradient-to-l md:from-red-500 md:to-blue-500",
      {},
    );
    expect(out).toContain("md:bg-gradient-to-l");
    expect(out).toContain("md:from-red-500");
    expect(out.split(/\s+/)).not.toContain("bg-gradient-to-r");
  });
});
