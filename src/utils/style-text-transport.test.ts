import { expect, test } from "vitest";
import { preserveStyleText } from "./style-text-transport";

test("masks only style text when a quoted attribute contains >", () => {
  const html = `<style media='screen and (width > 600px)'>.x { content: "a  b"; }</style>`;
  let masked = "";
  const restored = preserveStyleText(html, (value) => {
    masked = value;
    return value.replace(/\s+/g, " ");
  });

  expect(masked).toMatch(/media='screen and \(width > 600px\)'>__CHAI_STYLE_TEXT_0__<\/style>/);
  expect(restored).toBe(html);
});

test("restores CSS containing $ replacement patterns verbatim", () => {
  const html = `<style>.a::after { content: "$& $' $\` $$"; }</style>`;
  expect(preserveStyleText(html, (value) => value)).toBe(html);
});

test("leaves HTML without a style element to the normalizer only", () => {
  const html = `<div  class="a">  x  </div>`;
  expect(preserveStyleText(html, (value) => value.replace(/\s+/g, " "))).toBe(`<div class="a"> x </div>`);
});
