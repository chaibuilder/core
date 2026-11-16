/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTextEntryTarget } from "~/builder/hooks/keyboard-target";

const dispatchKeydownOn = (element: Element) => {
  if (!element.parentElement) {
    document.body.appendChild(element);
  }
  const event = new KeyboardEvent("keydown", { key: "z", bubbles: true });
  Object.defineProperty(event, "target", { value: element });
  return event;
};

describe("isTextEntryTarget", () => {
  it.each([
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number",
    "date",
    "datetime-local",
    "month",
    "week",
    "time",
  ])("returns true for input[type=%s]", (type) => {
    const input = document.createElement("input");
    input.type = type;
    expect(isTextEntryTarget(dispatchKeydownOn(input))).toBe(true);
  });

  it("returns true for an input with no type set", () => {
    const input = document.createElement("input");
    expect(isTextEntryTarget(dispatchKeydownOn(input))).toBe(true);
  });

  it.each(["checkbox", "radio", "range", "color", "file", "button", "submit", "reset"])(
    "returns false for input[type=%s]",
    (type) => {
      const input = document.createElement("input");
      input.type = type;
      expect(isTextEntryTarget(dispatchKeydownOn(input))).toBe(false);
    },
  );

  it("returns true for textarea", () => {
    const textarea = document.createElement("textarea");
    expect(isTextEntryTarget(dispatchKeydownOn(textarea))).toBe(true);
  });

  it("returns false for select", () => {
    const select = document.createElement("select");
    expect(isTextEntryTarget(dispatchKeydownOn(select))).toBe(false);
  });

  // `setAttribute`, not `element.contentEditable = "true"`: happy-dom neither implements
  // `isContentEditable` (always false) nor reflects that IDL setter to the attribute, so the
  // property form leaves nothing for either branch of `isTextEntryTarget` to find. These cover the
  // `closest('[contenteditable="true"]')` branch; the `isContentEditable` branch is what real
  // browsers hit and cannot be exercised under this environment.
  it("returns true for a contenteditable element", () => {
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(isTextEntryTarget(dispatchKeydownOn(div))).toBe(true);
  });

  it("returns true for a child of a contenteditable element", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);
    expect(isTextEntryTarget(dispatchKeydownOn(child))).toBe(true);
  });

  it("returns false for a plain div", () => {
    const div = document.createElement("div");
    expect(isTextEntryTarget(dispatchKeydownOn(div))).toBe(false);
  });

  it("returns false for the canvas <iframe> element — builder shortcuts (copy/paste) must run there", () => {
    // Regression: the removed `shouldIgnoreKeyEvent` blanket-ignored iframe
    // targets, which killed Cmd+C/V because selecting a block puts focus on the
    // <iframe> element in the parent document. Only text-entry targets are ignored now.
    const iframe = document.createElement("iframe");
    expect(isTextEntryTarget(dispatchKeydownOn(iframe))).toBe(false);
  });

  // Regression: the canvas watcher listens on the iframe's document, but this module runs in the
  // parent window, so `instanceof Element` (the parent's Element) was false for every canvas node —
  // no canvas input counted as text entry, and Backspace in one deleted the selected block.
  // happy-dom shares one set of DOM classes across every window and iframe it creates, so it cannot
  // produce a node from another realm. The parent window's DOM classes are swapped for foreign ones
  // instead: real canvas nodes then fail `instanceof` against them, as they do in a browser.
  describe("in another window, as in the canvas iframe", () => {
    beforeEach(() => {
      for (const name of ["Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement"]) {
        vi.stubGlobal(name, class {});
      }
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const inFrame = (tag: string, type?: string) => {
      const frameDoc = document.implementation.createHTMLDocument();
      const element = frameDoc.createElement(tag);
      if (type) element.setAttribute("type", type);
      frameDoc.body.appendChild(element);
      return element as unknown as Element;
    };

    it("is really another realm", () => {
      expect(inFrame("input") instanceof Element).toBe(false);
    });

    it.each([
      ["an input", "input", undefined],
      ["a search input", "input", "search"],
      ["a textarea", "textarea", undefined],
    ])("returns true for %s", (_label, tag, type) => {
      expect(isTextEntryTarget(dispatchKeydownOn(inFrame(tag, type)))).toBe(true);
    });

    it("returns true for a child of a contenteditable element", () => {
      const editor = inFrame("div");
      editor.setAttribute("contenteditable", "true");
      const child = editor.ownerDocument.createElement("span");
      editor.appendChild(child);
      expect(isTextEntryTarget(dispatchKeydownOn(child as unknown as Element))).toBe(true);
    });

    it.each([
      ["a checkbox", "input", "checkbox"],
      ["a plain div", "div", undefined],
    ])("returns false for %s", (_label, tag, type) => {
      expect(isTextEntryTarget(dispatchKeydownOn(inFrame(tag, type)))).toBe(false);
    });
  });

  it("returns false when the target is not an Element", () => {
    const event = new KeyboardEvent("keydown", { key: "z" });
    Object.defineProperty(event, "target", { value: null });
    expect(isTextEntryTarget(event)).toBe(false);
  });
});
