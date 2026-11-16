/**
 * @vitest-environment happy-dom
 */
import { FieldProps } from "@rjsf/utils";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { TooltipProvider } from "~/components/ui/tooltip";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import { LinkField } from "./link";

// The builder root layout supplies the TooltipProvider the data-binding selector needs.
const render = (ui: React.ReactElement) =>
  renderInBuilder(<TooltipProvider>{ui}</TooltipProvider>, {
    builderProps: {
      languages: [],
      fallbackLang: "en",
      pageTypes: [{ type: "page", label: "Page" }],
      searchPageTypeItems: async () => [],
    },
  });

/** The link-type `<select>`; the data-binding selector is a combobox too. */
const typeSelect = () => document.querySelector<HTMLSelectElement>('select[name="type"]')!;

type LinkFormData = { type: string; href: string; target: string };

function ControlledLinkField({ initial }: { initial: LinkFormData }) {
  const [formData, setFormData] = useState(initial);
  return (
    <LinkField
      {...({
        schema: { title: "Link" },
        name: "link",
        formData,
        onChange: (next: LinkFormData) => setFormData(next),
      } as unknown as FieldProps)}
    />
  );
}

describe("LinkField type select focus", () => {
  it("does not focus the href input on initial mount", () => {
    render(<ControlledLinkField initial={{ type: "url", href: "", target: "self" }} />);

    expect(document.activeElement).not.toBe(screen.getByPlaceholderText("Enter URL"));
  });

  it("focuses the href input when the link type changes", async () => {
    render(<ControlledLinkField initial={{ type: "url", href: "", target: "self" }} />);

    fireEvent.change(typeSelect(), { target: { value: "email" } });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Enter details"));
    });
  });

  it("focuses the page search input when type changes to pageType", async () => {
    render(<ControlledLinkField initial={{ type: "url", href: "", target: "self" }} />);

    fireEvent.change(typeSelect(), { target: { value: "pageType" } });

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Search pages"));
    });
  });
});
