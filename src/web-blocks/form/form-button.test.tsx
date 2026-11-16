/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { ChaiBlockComponentProps } from "~/types/blocks";
import { Component as FormButtonBlock, FormButtonProps } from "./form-button";

type Props = ChaiBlockComponentProps<FormButtonProps>;

const renderButton = (props: Partial<Props> = {}) =>
  render(
    <FormButtonBlock
      {...({
        blockProps: {},
        inBuilder: false,
        label: "Envoyer",
        styles: { className: "px-4" },
        icon: "",
        iconSize: 24,
        iconPos: "order-last",
        ...props,
      } as Props)}
    />,
  );

describe("FormButton accessible name", () => {
  it("uses the visible label", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Envoyer" })).toBeDefined();
  });

  it("never renders an empty aria-label for an icon-only button", () => {
    // An icon-only submit button used to render aria-label="" which strips the
    // accessible name and fails "Buttons must have discernible text".
    renderButton({ label: "", icon: "<svg />" });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Submit");
  });

  it("prefers an author-set aria-label attribute over the label", () => {
    renderButton({
      label: "Envoyer",
      styles: { className: "px-4", "aria-label": "S'abonner à l'infolettre" },
    });

    expect(screen.getByRole("button", { name: "S'abonner à l'infolettre" })).toBeDefined();
  });

  it("hides the decorative icon from the accessibility tree", () => {
    renderButton({ label: "Envoyer", icon: "<svg />" });

    expect(document.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it("resolves an authored aria-label the same way the spreads do", () => {
    // blockProps is spread after styles, so it wins at render time and the
    // aria-label resolution has to agree.
    renderButton({
      label: "Envoyer",
      styles: { className: "px-4", "aria-label": "from styles" },
      blockProps: { "aria-label": "from blockProps" },
    });

    expect(screen.getByRole("button", { name: "from blockProps" })).toBeDefined();
  });

  it("treats a whitespace-only label as absent", () => {
    renderButton({ label: "   ", icon: "<svg />" });

    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toBe("Submit");
    // No stray text node, and no margin meant to separate the icon from a
    // label that is not there.
    expect(button.textContent).toBe("");
    expect(document.querySelector(".ml-2")).toBeNull();
  });

  it("renders the trimmed label so it matches the computed name", () => {
    renderButton({ label: "  Envoyer  " });

    expect(screen.getByRole("button").textContent).toBe("Envoyer");
  });

  it("keeps the icon margin when there is a visible label", () => {
    renderButton({ label: "Envoyer", icon: "<svg />" });

    expect(document.querySelector(".ml-2")).not.toBeNull();
  });
});
