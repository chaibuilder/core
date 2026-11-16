import { describe, expect, it, vi } from "vitest";
import {
  hasBindings,
  isSimplePath,
  renderBinding,
  resolveBinding,
  resolveBindingPath,
  resolveBindingValue,
  resolveBindingVisibility,
  resolveStringBinding,
  sanitizeRawBindingValue,
} from "./binding-engine";

describe("sanitizeRawBindingValue", () => {
  it("keeps supported rich-text markup", () => {
    const html =
      '<pre class="shiki" style="background-color:#0d1117" tabindex="0"><code><span style="color:#FF7B72">x</span></code></pre>' +
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">y</a>';
    const output = sanitizeRawBindingValue(html);
    expect(output).toContain('class="shiki"');
    expect(output).toContain("background-color:#0d1117");
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it("strips scripts and event handlers", () => {
    const output = sanitizeRawBindingValue('<span onclick="alert(1)"><script>alert(1)</script>hi</span>');
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("<script>");
    expect(output).toContain("hi");
  });

  it("keeps heading anchor ids", () => {
    const out = sanitizeRawBindingValue('<h2 id="how-the-license-period-works">How the license period works</h2>');
    expect(out).toBe('<h2 id="how-the-license-period-works">How the license period works</h2>');
  });
});

describe("binding helpers", () => {
  it("detects bindings", () => {
    expect(hasBindings("Hello {{name}}")).toBe(true);
    expect(hasBindings("Hello name")).toBe(false);
  });

  it("recognizes only safe paths", () => {
    expect(isSimplePath("user.profile.name")).toBe(true);
    expect(isSimplePath("$index.name")).toBe(true);
    expect(isSimplePath("items.0.name")).toBe(true);
    expect(isSimplePath("price * 2")).toBe(false);
    expect(isSimplePath("items[0]")).toBe(false);
    expect(isSimplePath("user.__proto__")).toBe(false);
  });

  it("resolves repeater paths", () => {
    expect(resolveBindingPath("$index.name", 1, "{{items}}")).toBe("items.1.name");
    expect(resolveBindingPath("title", 1, "{{items}}")).toBe("title");
  });
});

describe("safe binding runtime", () => {
  it("resolves paths, mixed strings, arrays, and primitives", () => {
    expect(resolveBinding("{{user.name}}", { user: { name: "Ada" } })).toBe("Ada");
    expect(resolveBinding("Hello {{first}} {{last}}", { first: "Ada", last: "Lovelace" })).toBe("Hello Ada Lovelace");
    expect(resolveBinding("{{items}}", { items: [1, 2] })).toEqual([1, 2]);
    expect(resolveBinding("{{count}}", { count: 0 })).toBe("0");
    expect(resolveBinding("{{active}}", { active: false })).toBe("false");
    expect(resolveBinding("{{missing}}", {})).toBe("");
  });

  it("resolves pipelines", () => {
    expect(resolveBinding("{{title | trim | uppercase}}", { title: " chai " })).toBe("CHAI");
    expect(resolveBinding("{{price | currency 'USD' 2}}", { price: 12 }, "en-US")).toBe("$12.00");
  });

  it("preserves repeater and image values", () => {
    expect(resolveStringBinding("{{$index.name}}", { items: [{ name: "A" }] }, 0, "{{items}}", "title")).toBe("A");
    const image = { src: "/hero.jpg", alt: "Hero" };
    expect(resolveStringBinding("{{hero}}", { hero: image }, -1, "", "image")).toBe(image);
  });

  it("does not entity-escape non-HTML props (React/JSON sinks escape themselves) and sanitizes bound raw HTML", () => {
    // Text/attribute props: React escapes on render, so pre-escaping would double-encode.
    expect(resolveBinding("{{value}}", { value: "Beaucage & Fils l'Auto" })).toBe("Beaucage & Fils l'Auto");
    expect(resolveStringBinding("{{url}}", { url: "/x?a=1&b=2" }, -1, "", "href")).toBe("/x?a=1&b=2");
    // Markup in a non-raw prop stays literal text once React renders it; not escaped here.
    expect(resolveBinding("{{value}}", { value: "<strong>x</strong>" })).toBe("<strong>x</strong>");
    const output = resolveStringBinding(
      "<strong>Bio:</strong> {{bio}}",
      { bio: '<img src=x onerror="alert(1)">safe' },
      -1,
      "",
      "content",
    );
    expect(output).toContain("<strong>Bio:</strong>");
    expect(output).not.toContain("onerror");
    expect(output).toContain("safe");
  });

  it("treats CustomScript `scripts` as a raw-HTML sink: bound values are sanitized, never injected", () => {
    const output = resolveStringBinding(
      '<script>window.ok = true;</script>{{snippet}}',
      { snippet: '<img src=x onerror="alert(1)"><script>alert(2)</script>' },
      -1,
      "",
      "scripts",
    );
    // Author's static markup untouched; the bound value loses the handler and the script body.
    expect(output).toContain("<script>window.ok = true;</script>");
    expect(output).not.toContain("onerror");
    expect(output).not.toContain("alert(2)");
  });

  it("strips <style>/<script> bodies from bound raw HTML instead of leaking them as text", () => {
    const output = resolveStringBinding(
      "{{html}}",
      { html: '<div class="x"><ul><li>a</li></ul><style>.x{display:none}</style><script>alert(1)</script></div>' },
      -1,
      "",
      "content",
    );
    expect(output).toBe('<div class="x"><ul><li>a</li></ul></div>');
    expect(output).not.toContain("display:none");
    expect(output).not.toContain("&lt;style");
  });

  it("returns native values for complete bindings", () => {
    expect(resolveBindingValue("{{record}}", { record: { id: 1 } })).toEqual({ id: 1 });
  });

  it("fails closed for every unsupported JavaScript form", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases = [
      "price * 2",
      "price > 0",
      "active ? 'yes' : 'no'",
      "title.toUpperCase()",
      "items[0]",
      "items.map(x => x)",
      "Object.keys(record)",
      "globalThis.process",
      "constructor.constructor('return 1')()",
      "value | unknown",
    ];
    for (const expression of cases) {
      expect(resolveBinding(`{{${expression}}}`, { price: 2, active: true, title: "x", items: [1] })).toBe("");
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not throw for malformed bindings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => resolveBinding("before {{price >}} after", { price: 2 })).not.toThrow();
    expect(resolveBinding("before {{price >}} after", { price: 2 })).toBe("before  after");
    warn.mockRestore();
  });

  it("renders through low-level renderBinding", () => {
    expect(renderBinding("{{name | uppercase}}", { name: "chai" }, -1, "")).toBe("CHAI");
  });
});

describe("visibility", () => {
  it("accepts booleans, boolean paths, and boolean pipes", () => {
    expect(resolveBindingVisibility(true, {})).toBe(true);
    expect(resolveBindingVisibility("{{active}}", { active: true })).toBe(true);
    expect(resolveBindingVisibility("{{price | gt 0}}", { price: 1 })).toBe(true);
  });

  it("hides unsupported, invalid, and non-boolean bindings without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveBindingVisibility("{{price * 2}}", { price: 1 })).toBe(false);
    expect(resolveBindingVisibility("{{title}}", { title: "shown" })).toBe(false);
    expect(resolveBindingVisibility("{{title | missing}}", { title: "shown" })).toBe(false);
    expect(resolveBindingVisibility(null, {})).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips an unknown pipe and falls back to the bound value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveBindingVisibility("{{value | missing}}", { value: true })).toBe(true);
    warn.mockRestore();
  });

  // Legacy `_show` conditions authored under the Eta engine used JS truthiness/negation.
  // The parser desugars `!!path`→`| truthy` and `!path`→`| not` so they keep working.
  it("resolves legacy `!!` truthiness and `!` negation prefixes", () => {
    const data = { global: { social: { facebook: "https://fb.com/x", twitter: "" } } };
    expect(resolveBindingVisibility("{{!!global.social.facebook}}", data)).toBe(true);
    expect(resolveBindingVisibility("{{!!global.social.twitter}}", data)).toBe(false);
    expect(resolveBindingVisibility("{{!!global.social.instagram}}", data)).toBe(false); // absent key
    expect(resolveBindingVisibility("{{!global.social.twitter}}", data)).toBe(true);
    expect(resolveBindingVisibility("{{!global.social.facebook}}", data)).toBe(false);
  });

  // Boolean combinations (`&&` / `||`) are visibility-only; each operand is re-parsed
  // by the safe parser, so `{{!model.model && !vehicle.model}}` renders correctly.
  it("combines boolean operands with && and ||", () => {
    expect(resolveBindingVisibility("{{!model.model && !vehicle.model}}", { model: {}, vehicle: {} })).toBe(true);
    expect(
      resolveBindingVisibility("{{!model.model && !vehicle.model}}", { model: { model: "CX-5" }, vehicle: {} }),
    ).toBe(false);
    expect(
      resolveBindingVisibility("{{!!global.a || !!global.b}}", { global: { a: "", b: "set" } }),
    ).toBe(true);
    expect(resolveBindingVisibility("{{!!global.a || !!global.b}}", { global: { a: "", b: "" } })).toBe(false);
  });

  // Legacy comparison idiom (`{{path == 'x'}}`) desugars to `path | equals 'x'`.
  it("resolves legacy comparison conditions", () => {
    expect(resolveBindingVisibility("{{vehicle.stock_status == 'Réservé'}}", { vehicle: { stock_status: "Réservé" } })).toBe(true);
    expect(resolveBindingVisibility("{{vehicle.stock_status == 'Réservé'}}", { vehicle: { stock_status: "Vendu" } })).toBe(false);
    expect(resolveBindingVisibility("{{vehicle.km <= 100000}}", { vehicle: { km: 45000 } })).toBe(true);
  });

  it("ignores whitespace around the braces", () => {
    const binding = " {{vehicle.stock_status == 'Réservé'}} ";
    expect(resolveBindingVisibility(binding, { vehicle: { stock_status: "Réservé" } })).toBe(true);
    expect(resolveBindingVisibility(binding, { vehicle: { stock_status: "Vendu" } })).toBe(false);
  });

  it("respects && / || precedence without parentheses", () => {
    // `a || b && c` === `a || (b && c)`
    const data = (a: boolean, b: boolean, c: boolean) => ({ f: { a, b, c } });
    const expr = "{{f.a || f.b && f.c}}";
    expect(resolveBindingVisibility(expr, data(true, false, false))).toBe(true);
    expect(resolveBindingVisibility(expr, data(false, true, true))).toBe(true);
    expect(resolveBindingVisibility(expr, data(false, true, false))).toBe(false);
  });

  it("fails closed when a combined operand is not boolean or is empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // `title` is a bare non-boolean path → whole expression hidden.
    expect(resolveBindingVisibility("{{!!ok && title}}", { ok: 1, title: "x" })).toBe(false);
    expect(resolveBindingVisibility("{{!!ok && }}", { ok: 1 })).toBe(false);
    warn.mockRestore();
  });
});

// Conditional visibility (`_show`) is resolved outside `applyBindingToBlockProps`, which
// skips `_`-prefixed keys. Renderers evaluate it with current repeater index/key.
describe("conditional visibility in repeater context", () => {
  const data = {
    items: [
      { title: "A", featured: true, stock: 0 },
      { title: "B", featured: false, stock: 5 },
    ],
  };
  const key = "{{items}}";
  const isShown = (expression: string, index: number) =>
    resolveBindingVisibility(expression, data, {
      index,
      repeaterKey: index === -1 ? "" : key,
    });

  it("resolves a boolean field of the current repeater item", () => {
    expect(isShown("{{$index.featured}}", 0)).toBe(true);
    expect(isShown("{{$index.featured}}", 1)).toBe(false);
  });

  it("resolves a comparison over the current repeater item", () => {
    expect(isShown("{{$index.stock | gt 0}}", 0)).toBe(false);
    expect(isShown("{{$index.stock | gt 0}}", 1)).toBe(true);
  });

  it("still resolves page-level bindings inside a repeater", () => {
    expect(resolveStringBinding("{{items.0.featured}}", data, 1, key)).toBe("true");
  });

  it("renders nothing usable for $index outside a repeater", () => {
    expect(resolveStringBinding("{{$index.featured}}", data, -1, "")).toBe("");
  });
});

// `$item` mirrors `$index` for the Collection Item block: renderers pass the block's
// resolved item key so inner bindings and `_show` resolve against the single found item.
describe("collection item context", () => {
  const data = {
    "#agents/blk1": [{ name: "Ann", featured: true, stock: 0 }],
  };
  const itemKey = "#agents/blk1.0";

  it("resolves $item values through resolveStringBinding and resolveBindingValue", () => {
    expect(resolveStringBinding("By {{$item.name}}", data, -1, "", undefined, "en", itemKey)).toBe("By Ann");
    expect(resolveBindingValue("{{$item}}", data, { itemKey })).toEqual(data["#agents/blk1"][0]);
  });

  it("resolves $item visibility bindings", () => {
    expect(resolveBindingVisibility("{{$item.featured}}", data, { itemKey })).toBe(true);
    expect(resolveBindingVisibility("{{$item.stock | gt 0}}", data, { itemKey })).toBe(false);
  });

  it("renders nothing usable for $item outside a collection item", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveStringBinding("{{$item.name}}", data, -1, "")).toBe("");
    warn.mockRestore();
  });
});
