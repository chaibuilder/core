// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChaiBlockComponentProps } from "~/types/blocks";
import { ButtonProps, Component as ButtonBlock } from "./button";

type Props = ChaiBlockComponentProps<ButtonProps>;

const renderButton = (props: Partial<Props> = {}) =>
  render(
    <ButtonBlock
      {...({
        blockProps: {},
        inBuilder: false,
        content: "Envoyer",
        styles: { className: "px-4" },
        icon: "",
        iconSize: 24,
        iconPos: "order-last",
        link: { href: "", target: "_self" },
        ...props,
      } as Props)}
    />,
  );

describe("Button accessible name", () => {
  it("uses the visible content", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDefined();
  });

  it("never renders an empty aria-label", () => {
    // aria-label="" blanks the accessible name outright, which is worse than
    // omitting the attribute and letting the content name the button.
    renderButton({ content: "" });

    expect(screen.getByRole("button").hasAttribute("aria-label")).toBe(false);
  });

  it("prefers an author-set aria-label attribute over the content", () => {
    renderButton({
      content: "Envoyer",
      styles: { className: "px-4", "aria-label": "S'abonner" },
    });

    expect(screen.getByRole("button", { name: "S'abonner" })).toBeDefined();
  });

  it("resolves an authored aria-label the same way the spreads do", () => {
    // styles is spread after blockProps, so it wins at render time and the
    // aria-label resolution has to agree.
    renderButton({
      styles: { className: "px-4", "aria-label": "from styles" },
      blockProps: { "aria-label": "from blockProps" },
    });

    expect(screen.getByRole("button", { name: "from styles" })).toBeDefined();
  });

  it("treats whitespace-only content as absent rather than as a label", () => {
    renderButton({ content: "   ", icon: "<svg />" });

    const button = screen.getByRole("button");
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.querySelector("span")).toBeNull();
  });

  it("renders the trimmed content so it matches the computed name", () => {
    renderButton({ content: "  Envoyer  " });

    expect(screen.getByRole("button").textContent).toBe("Envoyer");
  });

  it("hides the icon once the button already has a name", () => {
    renderButton({ content: "Envoyer", icon: "<svg />" });

    expect(document.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it("leaves an icon-only button its icon in the accessibility tree", () => {
    // Hiding the icon here would strip the button's last chance at a name, so
    // the icon markup (e.g. an <svg><title>) has to stay visible to AT.
    renderButton({ content: "", icon: "<svg><title>Fermer</title></svg>" });

    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("lets nested children name the button instead of the content prop", () => {
    // When children supply the visible text, `content` is usually a stale
    // schema default ("Button") and must not override the real name.
    renderButton({ content: "Button", children: <span>Voir plus</span> });

    const button = screen.getByRole("button", { name: "Voir plus" });
    expect(button.hasAttribute("aria-label")).toBe(false);
  });

  it("applies the resolved name to the link too", () => {
    renderButton({
      content: "Envoyer",
      link: { href: "/contact", target: "_self" },
    });

    expect(screen.getByRole("link", { name: "Envoyer" })).toBeDefined();
  });
});

describe("Button link rendering", () => {
  it("renders a single <a> instead of nesting a <button> inside the link", () => {
    renderButton({
      content: "Envoyer",
      link: { href: "/contact", target: "_self" },
    });

    expect(screen.getByRole("link").getAttribute("href")).toBe("/contact");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("moves the button styles onto the link so the visuals hold", () => {
    renderButton({
      styles: { className: "px-4" },
      blockProps: { "data-block-id": "b1" },
      link: { href: "/contact", target: "_self" },
    });

    const link = screen.getByRole("link");
    expect(link.getAttribute("class")).toBe("px-4");
    expect(link.getAttribute("data-block-id")).toBe("b1");
  });

  it("still renders a real <button> when no href is set", () => {
    renderButton({ content: "Envoyer" });

    expect(screen.getByRole("button")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
