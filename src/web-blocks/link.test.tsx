// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChaiBlockComponentProps } from "~/types/blocks";
import { LinkBlockProps, Component as LinkBlock } from "./link";

type Props = ChaiBlockComponentProps<LinkBlockProps>;

const renderLink = (props: Partial<Props> = {}) =>
  render(
    <LinkBlock
      {...({
        blockProps: {},
        inBuilder: false,
        content: "Link text goes here",
        styles: { className: "px-4" },
        link: { href: "/inventaire", target: "_self" },
        ...props,
      } as Props)}
    />,
  );

describe("Link accessible name", () => {
  it("does not leak the schema-default content as aria-label over children", () => {
    // With nested children the visible text lives in those children while
    // `content` keeps the default, which used to rename every such link
    // "Link text goes here" for AT users.
    renderLink({ children: <span>Véhicules neufs</span> });

    const link = screen.getByRole("link", { name: "Véhicules neufs" });
    expect(link.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps an author-set aria-label from the styles attributes", () => {
    renderLink({
      children: <span>Icon</span>,
      styles: { className: "px-4", "aria-label": "Inventaire neuf" },
    });

    expect(screen.getByRole("link", { name: "Inventaire neuf" })).toBeDefined();
  });

  it("renders content as the link text without a redundant aria-label", () => {
    renderLink({ content: "Nous joindre" });

    const link = screen.getByRole("link", { name: "Nous joindre" });
    expect(link.hasAttribute("aria-label")).toBe(false);
  });
});
