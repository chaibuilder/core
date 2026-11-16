/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { renderInBuilder } from "~/tests/builder/render-in-builder";
import RteLinkForm, { toLinkHref } from "./rte-link-form";
import { RteLink } from "./use-rte-editor";

const ABOUT = { id: "about-id", name: "About us", slug: "/about", pageType: "page" };
const INTERNAL_LINK_HOSTS = ["example.com", "preview.example.com", "branch.example.com"];

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

const createEditor = (content: string) => {
  const editor = new Editor({ extensions: [StarterKit, RteLink], content });
  editors.push(editor);
  return editor;
};

const renderForm = (editor: Editor, searchPageTypeItems = vi.fn(async () => [ABOUT])) => {
  const onClose = vi.fn();
  renderInBuilder(<RteLinkForm editor={editor} onClose={onClose} />, {
    builderProps: {
      pageTypes: [{ key: "page", name: "Page" }],
      searchPageTypeItems,
      internalLinkHosts: INTERNAL_LINK_HOSTS,
    },
  });
  return { onClose, searchPageTypeItems };
};

describe("RteLink", () => {
  it("keeps a page ref through load and save, without new-tab attributes", () => {
    const editor = createEditor(`<p>See <a href="pageType:page:about-id">about</a></p>`);

    expect(editor.getHTML()).toBe(`<p>See <a class="underline" href="pageType:page:about-id">about</a></p>`);
  });

  it("keeps each link's own target/rel instead of forcing a new tab, and rejects javascript: hrefs", () => {
    const editor = createEditor(
      `<p><a href="https://a.com" target="_blank" rel="noopener noreferrer nofollow">new</a> ` +
        `<a href="https://b.com">same</a> <a href="javascript:alert(1)">bad</a></p>`,
    );

    expect(editor.getHTML()).toBe(
      `<p><a target="_blank" rel="noopener noreferrer nofollow" class="underline" href="https://a.com">new</a> ` +
        `<a class="underline" href="https://b.com">same</a> bad</p>`,
    );
  });
});

describe("toLinkHref", () => {
  it.each([
    ["info@dealer.com", "mailto:info@dealer.com"],
    ["(514) 555-1234", "tel:5145551234"],
    ["+1 514 555 1234", "tel:+15145551234"],
    ["mailto:info@dealer.com?subject=Hi", "mailto:info@dealer.com?subject=Hi"],
    ["tel:+15145551234", "tel:+15145551234"],
    ["https://example.com/a@b.c", "https://example.com/a@b.c"],
    ["/contact", "/contact"],
    ["#form", "#form"],
    ["2024", "2024"],
  ])("%s -> %s", (input, href) => {
    expect(toLinkHref(input)).toBe(href);
  });
});

describe("RteLinkForm", () => {
  it("links the selection to a picked page as a pageType: ref", async () => {
    const editor = createEditor("<p>Read more</p>");
    editor.commands.setTextSelection({ from: 1, to: 5 });
    const { onClose } = renderForm(editor);

    fireEvent.change(screen.getByPlaceholderText("Search pages"), { target: { value: "abo" } });
    fireEvent.click(await screen.findByText("About us"));

    expect(editor.getHTML()).toBe(`<p><a class="underline" href="pageType:page:about-id">Read</a> more</p>`);
    expect(onClose).toHaveBeenCalled();
  });

  it("links the selection to a typed email address on Enter, adding its mailto:", () => {
    const editor = createEditor("<p>Read more</p>");
    editor.commands.setTextSelection({ from: 1, to: 5 });
    renderForm(editor);

    fireEvent.click(screen.getByRole("button", { name: "URL / Email / Phone" }));
    const input = screen.getByPlaceholderText("URL, email or phone");
    fireEvent.change(input, { target: { value: " hi@example.com " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(editor.getHTML()).toContain(`href="mailto:hi@example.com">Read</a>`);
  });

  it.each(["Page", "URL / Email / Phone"])("opens a %s link in a new tab when ticked", async (tab) => {
    const editor = createEditor("<p>Read more</p>");
    editor.commands.setTextSelection({ from: 1, to: 5 });
    renderForm(editor);

    fireEvent.click(screen.getByRole("button", { name: tab }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Open in new tab" }));
    if (tab === "Page") {
      fireEvent.change(screen.getByPlaceholderText("Search pages"), { target: { value: "abo" } });
      fireEvent.click(await screen.findByText("About us"));
    } else {
      const input = screen.getByPlaceholderText("URL, email or phone");
      fireEvent.change(input, { target: { value: "https://example.com" } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    const html = editor.getHTML();
    expect(html).toContain(`<a target="_blank" rel="noopener noreferrer" class="underline"`);
    expect(html).toContain(`data-new-tab="true">Read</a>`);
  });

  it("switches an existing link to the same tab as soon as the box is unticked", () => {
    const editor = createEditor(
      `<p><a href="pageType:page:about-id" target="_blank" rel="noopener noreferrer" data-new-tab="true">Read</a> more</p>`,
    );
    editor.commands.setTextSelection(2);
    const { onClose } = renderForm(editor);

    const checkbox = screen.getByRole("checkbox", { name: "Open in new tab" });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(checkbox);

    expect(editor.getHTML()).toBe(`<p><a class="underline" href="pageType:page:about-id">Read</a> more</p>`);
    expect(onClose).not.toHaveBeenCalled();
  });

  // The old editor wrote this `_blank` on every link; sites only honour it on external ones.
  it.each([
    ["/contact", "false"],
    ["pageType:page:about-id", "false"],
    ["https://example.com/contact", "false"],
    ["https://preview.example.com/contact", "false"],
    ["https://branch.example.com/contact", "false"],
    ["https://other.com", "true"],
    ["https://example.com.other.com/contact", "true"],
  ])("shows an old-editor %s link's new tab as %s", (href, checked) => {
    const editor = createEditor(`<p><a href="${href}" target="_blank" rel="noopener noreferrer nofollow">Read</a></p>`);
    editor.commands.setTextSelection(2);
    renderForm(editor);

    expect(screen.getByRole("checkbox", { name: "Open in new tab" }).getAttribute("aria-checked")).toBe(checked);
  });

  it.each(INTERNAL_LINK_HOSTS)("preserves same-tab behavior when applying a legacy absolute link on %s", (host) => {
    const editor = createEditor(
      `<p><a href="https://${host}/contact" target="_blank" rel="noopener noreferrer nofollow">Read</a></p>`,
    );
    editor.commands.setTextSelection(2);
    renderForm(editor);

    fireEvent.change(screen.getByPlaceholderText("URL, email or phone"), {
      target: { value: `https://${host}/about` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(editor.getHTML()).toBe(`<p><a class="underline" href="https://${host}/about">Read</a></p>`);
  });

  it("preserves an explicitly chosen new tab when editing a same-site absolute link", () => {
    const editor = createEditor(
      `<p><a href="https://example.com/contact" target="_blank" rel="noopener noreferrer" data-new-tab="true">Read</a></p>`,
    );
    editor.commands.setTextSelection(2);
    renderForm(editor);

    expect(screen.getByRole("checkbox", { name: "Open in new tab" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(editor.getHTML()).toContain('target="_blank"');
    expect(editor.getHTML()).toContain('data-new-tab="true"');
  });

  it("shows the linked page's name when editing a page link, and removes the link", async () => {
    const editor = createEditor(`<p><a href="pageType:page:about-id">Read</a> more</p>`);
    editor.commands.setTextSelection(2);
    const { searchPageTypeItems } = renderForm(editor);

    await waitFor(() => expect(screen.getByPlaceholderText<HTMLInputElement>("Search pages").value).toBe("About us"));
    expect(searchPageTypeItems).toHaveBeenCalledWith("", ["about-id"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));

    expect(editor.getHTML()).toBe("<p>Read more</p>");
  });
});
