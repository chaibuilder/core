// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { CORE_STRUCTURE_RULES } from "../structure-rules";

describe("Structure Rule: no-animation-above-the-fold", () => {
  const rule = CORE_STRUCTURE_RULES.find((r) => r.name === "no-animation-above-the-fold");

  it("should find the rule", () => {
    expect(rule).toBeDefined();
  });

  it("should return no errors when there are no animated elements", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <h1>Welcome</h1>
        </div>
      </div>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });

  it("should return warning when there is an animated element above the fold (< 800px)", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <h1 data-animation="slide-up|ease|500|0|once" data-block-id="hero-title">Welcome</h1>
        </div>
      </div>
    `;

    const element = doc.querySelector('[data-block-id="hero-title"]');
    if (element) {
      element.getBoundingClientRect = () => ({
        top: 200,
        left: 0,
        bottom: 250,
        right: 0,
        width: 100,
        height: 50,
      } as DOMRect);
    }

    const errors = rule!.validate(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      id: "animation-above-the-fold-hero-title",
      message: "Remove the animation from content at the top of the page. It slows the page down and can hurt search ranking.",
      severity: "warning",
      blockId: "hero-title",
      partialBlockId: undefined,
    });
  });

  it("should return no errors when animated elements are below the fold (>= 800px)", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <h1>Welcome</h1>
        </div>
        <div data-block-id="features-2">
          <div data-animation="fade-in|ease|500|0|once" data-block-id="feature-card-1">Feature</div>
        </div>
      </div>
    `;

    const element = doc.querySelector('[data-block-id="feature-card-1"]');
    if (element) {
      element.getBoundingClientRect = () => ({
        top: 850,
        left: 0,
        bottom: 950,
        right: 0,
        width: 100,
        height: 100,
      } as DOMRect);
    }

    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });
});

describe("Structure Rule: no-lazy-load-above-the-fold", () => {
  const rule = CORE_STRUCTURE_RULES.find((r) => r.name === "no-lazy-load-above-the-fold");

  it("should find the rule", () => {
    expect(rule).toBeDefined();
  });

  it("should return no errors when there are no lazy loaded images", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <img src="test.jpg" data-block-id="image-1" />
        </div>
      </div>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });

  it("should return warning when there is a lazy loaded image above the fold (< 800px)", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <img src="test.jpg" loading="lazy" data-block-id="image-1" />
        </div>
      </div>
    `;

    const element = doc.querySelector('[data-block-id="image-1"]');
    if (element) {
      element.getBoundingClientRect = () => ({
        top: 200,
        left: 0,
        bottom: 400,
        right: 0,
        width: 200,
        height: 200,
      } as DOMRect);
    }

    const errors = rule!.validate(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      id: "lazy-load-above-the-fold-image-1",
      message: "This image is at the top of the page. Turn off Lazy Load so it shows up right away.",
      severity: "warning",
      blockId: "image-1",
      partialBlockId: undefined,
    });
  });

  it("should return no errors when lazy loaded images are below the fold (>= 800px)", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <h1>Welcome</h1>
        </div>
        <div data-block-id="features-2">
          <img src="test.jpg" loading="lazy" data-block-id="image-2" />
        </div>
      </div>
    `;

    const element = doc.querySelector('[data-block-id="image-2"]');
    if (element) {
      element.getBoundingClientRect = () => ({
        top: 850,
        left: 0,
        bottom: 1050,
        right: 0,
        width: 200,
        height: 200,
      } as DOMRect);
    }

    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });
});

describe("Structure Rule: form-has-required-field", () => {
  const rule = CORE_STRUCTURE_RULES.find((r) => r.name === "form-has-required-field");

  it("should find the rule", () => {
    expect(rule).toBeDefined();
  });

  it("should return no errors when there are no forms", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <div class="frame-root">
        <div data-block-id="hero-1">
          <h1>Welcome</h1>
        </div>
      </div>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });

  it("should return warning when a Form has no required field", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <form data-block-type="Form" data-block-id="form-1">
        <input type="text" name="name" />
        <input type="email" name="email" />
      </form>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      id: "form-has-required-field-form-1",
      message: "Make at least one field in this form required.",
      severity: "warning",
      blockId: "form-1",
      partialBlockId: undefined,
    });
  });

  it("should return no errors when a Form has at least one required field", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <form data-block-type="Form" data-block-id="form-1">
        <input type="text" name="name" required />
        <input type="email" name="email" />
      </form>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });

  it("should NOT flag GETForm blocks (optional search filters are valid without a required field)", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `
      <form data-block-type="GETForm" data-block-id="get-form-1">
        <input type="text" name="q" />
      </form>
    `;
    const errors = rule!.validate(doc);
    expect(errors).toEqual([]);
  });
});
