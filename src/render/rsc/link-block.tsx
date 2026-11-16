import Link from "next/link";
import * as React from "react";
import { ChaiBlockComponentProps, ChaiStyles } from "~/types";

type LinkProps = {
  styles: ChaiStyles;
  content: string;
  link: {
    type: "page" | "pageType" | "url" | "email" | "telephone" | "element";
    target: "_self" | "_blank";
    href: string;
  };
  prefetchLink?: boolean;
};

const formatTelephoneLink = (href: string) => {
  return href.replace(/[^\d]/g, "");
};

export const LinkBlock = (props: ChaiBlockComponentProps<LinkProps>) => {
  const { link, styles, children, content, prefetchLink } = props;
  const href = link?.type === "telephone" ? `tel:${formatTelephoneLink(link?.href ?? "")}` : link?.href;
  // Never promote `content` to aria-label: with nested children the visible
  // text lives in those children while `content` often still holds the schema
  // default ("Link text goes here" / "Link goes here"), which would override
  // the real accessible name. Without children `content` is already the
  // rendered text, so a label is redundant. Author-set aria-labels still flow
  // through the styles spread.
  if (children) {
    return (
      <Link href={href || "#/"} target={link?.target} {...styles} {...(prefetchLink ? { prefetch: true } : {})}>
        {children}
      </Link>
    );
  }

  return React.createElement(
    Link,
    {
      ...styles,
      // A Link saved with no href (an imported JS toggle) must still render: Next's <Link> throws
      // on `href={undefined}` and takes the whole page's server render down with it.
      href: href || "#",
      target: link?.target || "_self",
      ...(prefetchLink ? { prefetch: true } : {}),
    },
    content,
  );
};

export const LinkConfig = {
  type: "Link",
  label: "Link",
  group: "basic",
  schema: {
    properties: {
      link: {
        type: "object",
        title: "Link",
      },
      prefetchLink: {
        type: "boolean",
        default: false,
        title: "Prefetch Link",
      },
    },
  },
  i18nProps: ["content"],
};
