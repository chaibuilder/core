export type StructureError = {
  id: string;
  message: string;
  severity: "error" | "warning";
  blockId?: string;
  partialBlockId?: string;
};

// What is open in the editor: a page, or a partial/global block on its own.
export type StructureRuleContext = "page" | "global-block";

export type StructureRule = {
  name: string;
  description: string;
  appliesOn?: "all" | StructureRuleContext;
  validate: (canvasDocument: Document) => StructureError[];
};

export const isRuleApplicable = (rule: StructureRule, context: StructureRuleContext) =>
  !rule.appliesOn || rule.appliesOn === "all" || rule.appliesOn === context;

// Helper function to get the referenced partial/global page id for an element.
// Global blocks render as [data-block-type="GlobalBlock"] and partial blocks as
// [data-block-type="PartialBlock"]; both expose the referenced page id via
// data-partial-block-id (falling back to data-block-id for older markup) so the
// errors panel can navigate into the partial/global via gotoPage.
const getPartialBlockId = (element: Element): string | undefined => {
  const partialBlock = element.closest(
    '[data-block-type="PartialBlock"], [data-block-type="GlobalBlock"]',
  );
  if (!partialBlock) return undefined;
  return (
    partialBlock.getAttribute("data-partial-block-id") || partialBlock.getAttribute("data-block-id") || undefined
  );
};

// Core structure validation rules
export const CORE_STRUCTURE_RULES: StructureRule[] = [
  {
    name: "no-nested-div-in-p",
    description: "Prevents div elements from being nested inside paragraph elements",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find all divs inside paragraphs
      const divsInParagraphs = canvasDocument.querySelectorAll('p [data-block-type="Box"]');

      divsInParagraphs.forEach((div) => {
        const blockId = div.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `div-in-paragraph-${blockId}`,
            message: "A Box can't go inside a Paragraph. Move it outside the paragraph.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(div),
          });
        }
      });

      return errors;
    },
  },
  {
    name: "no-interactive-nesting",
    description:
      "Prevents interactive elements (links, buttons with href) from being nested inside other interactive elements",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find nested links (a inside a)
      const nestedLinks = canvasDocument.querySelectorAll('[data-block-type="Link"] [data-block-type="Link"]');
      nestedLinks.forEach((link) => {
        const blockId = link.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `nested-interactive-link-${blockId}`,
            message: "A link can't go inside another link or button. Move it outside.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(link),
          });
        }
      });

      // Find links inside buttons
      const linksInButtons = canvasDocument.querySelectorAll('button [data-block-type="Link"]');
      linksInButtons.forEach((link) => {
        const blockId = link.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `nested-interactive-link-in-button-${blockId}`,
            message: "A link can't go inside another link or button. Move it outside.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(link),
          });
        }
      });

      return errors;
    },
  },

  {
    name: "listitem-in-list",
    description: "Ensures ListItems are only inside List containers",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find all list items
      const allListItems = canvasDocument.querySelectorAll('li[data-block-type="ListItem"]');

      allListItems.forEach((li) => {
        // Check if it has a ul or ol parent
        const listParent = li.closest("ul, ol");
        if (!listParent) {
          const blockId = li.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `listitem-outside-list-${blockId}`,
              message: "A List Item must go inside a List.",
              severity: "error",
              blockId,
              partialBlockId: getPartialBlockId(li),
            });
          }
        }
      });

      return errors;
    },
  },

  {
    name: "table-cell-structure",
    description: "Validates proper table hierarchy (TableCell -> TableRow -> TableHead/Body -> Table)",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find all table cells
      const allCells = canvasDocument.querySelectorAll(
        'td[data-block-type="TableCell"], th[data-block-type="TableCell"]',
      );

      allCells.forEach((cell) => {
        const hasTableRow = cell.closest("tr") !== null;
        const hasTableSection = cell.closest("thead, tbody") !== null;
        const hasTable = cell.closest("table") !== null;

        if (!hasTableRow || !hasTableSection || !hasTable) {
          const blockId = cell.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `table-cell-structure-${blockId}`,
              message: "This table cell is out of place. Put it inside a row of a table.",
              severity: "error",
              blockId,
              partialBlockId: getPartialBlockId(cell),
            });
          }
        }
      });

      // Find all table rows
      const allRows = canvasDocument.querySelectorAll('tr[data-block-type="TableRow"]');
      allRows.forEach((row) => {
        const hasTable = row.closest("table") !== null;
        if (!hasTable) {
          const blockId = row.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `table-row-outside-table-${blockId}`,
              message: "This table row is out of place. Put it inside a table.",
              severity: "error",
              blockId,
              partialBlockId: getPartialBlockId(row),
            });
          }
        }
      });

      // Find all table sections
      const allSections = canvasDocument.querySelectorAll(
        'thead[data-block-type="TableHead"], tbody[data-block-type="TableBody"]',
      );
      allSections.forEach((section) => {
        const hasTable = section.closest("table") !== null;
        if (!hasTable) {
          const blockId = section.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `table-section-outside-table-${blockId}`,
              message: "This table section is out of place. Put it inside a table.",
              severity: "error",
              blockId,
              partialBlockId: getPartialBlockId(section),
            });
          }
        }
      });

      return errors;
    },
  },

  {
    name: "no-nested-buttons",
    description: "Prevents buttons from being nested inside other buttons",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find nested buttons
      const nestedButtons = canvasDocument.querySelectorAll('button button[data-block-type="Button"]');

      nestedButtons.forEach((button) => {
        const blockId = button.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `nested-button-${blockId}`,
            message: "A button can't go inside another button.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(button),
          });
        }
      });

      return errors;
    },
  },
  {
    name: "no-nested-forms",
    description: "Prevents forms from being nested inside other forms",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find nested forms
      const nestedForms = canvasDocument.querySelectorAll('[data-block-type="Form"] [data-block-type="Form"]');

      nestedForms.forEach((form) => {
        const blockId = form.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `nested-form-${blockId}`,
            message: "A form can't go inside another form.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(form),
          });
        }
      });

      return errors;
    },
  },
  {
    name: "no-nested-paragraphs",
    description: "Prevents paragraph elements from being nested inside other paragraph elements at any level",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find nested paragraphs
      const nestedParagraphs = canvasDocument.querySelectorAll('p p[data-block-type="Paragraph"]');

      nestedParagraphs.forEach((p) => {
        const blockId = p.getAttribute("data-block-id");
        if (blockId) {
          errors.push({
            id: `nested-paragraph-${blockId}`,
            message: "A paragraph can't go inside another paragraph.",
            severity: "error",
            blockId,
            partialBlockId: getPartialBlockId(p),
          });
        }
      });

      return errors;
    },
  },

  {
    name: "heading-structure",
    description: "Checks for proper heading hierarchy and warns about skipped levels",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];
      const headings: { level: number; blockId: string; element: Element }[] = [];

      // Collect all headings in document order
      const allHeadings = canvasDocument.querySelectorAll("h1, h2, h3, h4, h5, h6");

      allHeadings.forEach((heading) => {
        const blockType = heading.getAttribute("data-block-type");
        if (blockType === "Heading") {
          const tagName = heading.tagName.toLowerCase();
          const level = parseInt(tagName.replace("h", "")) || 2;
          const blockId = heading.getAttribute("data-block-id");

          if (blockId) {
            headings.push({ level, blockId, element: heading });
          }
        }
      });

      // Check for skipped heading levels
      for (let i = 1; i < headings.length; i++) {
        const current = headings[i];
        const previous = headings[i - 1];

        if (current.level > previous.level + 1) {
          errors.push({
            id: `heading-level-skip-${current.blockId}`,
            message:
              `Headings skip a level here (H${previous.level} then H${current.level}). Use H${previous.level + 1} instead.`,
            severity: "warning",
            blockId: current.blockId,
            partialBlockId: getPartialBlockId(current.element),
          });
        }
      }

      return errors;

    },
  },
  {
    name: "no-animation-above-the-fold",
    description: "Warns if data-animation is added to elements above the fold",
    appliesOn: "page",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];
      const FOLD_HEIGHT = 800; // Standard fold height in pixels

      // Find all elements with data-animation attribute
      const animatedElements = canvasDocument.querySelectorAll("[data-animation]");

      animatedElements.forEach((el) => {
        // Calculate the absolute top position of the element from the top of the page
        const rect = el.getBoundingClientRect();
        const win = canvasDocument.defaultView || window;
        const scrollTop = win.pageYOffset || canvasDocument.documentElement.scrollTop || 0;
        const elementTop = rect.top + scrollTop;

        // If the element's top position is less than the fold height, it is above the fold
        if (elementTop < FOLD_HEIGHT) {
          const blockId = el.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `animation-above-the-fold-${blockId}`,
              message:
                "Remove the animation from content at the top of the page. It slows the page down and can hurt search ranking.",
              severity: "warning",
              blockId,
              partialBlockId: getPartialBlockId(el),
            });
          }
        }
      });

      return errors;
    },
  },
  {
    name: "no-lazy-load-above-the-fold",
    description: "Warns if images are lazy loaded above the fold",
    appliesOn: "page",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];
      const FOLD_HEIGHT = 800; // Standard fold height in pixels

      // Find all lazy-loaded image elements
      const lazyImages = canvasDocument.querySelectorAll('img[loading="lazy"]');

      lazyImages.forEach((el, index) => {
        // Calculate the absolute top position of the element from the top of the page
        const rect = el.getBoundingClientRect();
        const win = canvasDocument.defaultView || window;
        const scrollTop = win.pageYOffset || canvasDocument.documentElement.scrollTop || 0;
        const elementTop = rect.top + scrollTop;

        // If the element's top position is less than the fold height, it is above the fold
        if (elementTop < FOLD_HEIGHT) {
          const elementBlockId = el.getAttribute("data-block-id");
          const blockId =
            elementBlockId || el.closest("[data-block-id]")?.getAttribute("data-block-id");
          if (blockId) {
            const idSuffix = elementBlockId ? blockId : `${blockId}-${index}`;
            errors.push({
              id: `lazy-load-above-the-fold-${idSuffix}`,
              message: "This image is at the top of the page. Turn off Lazy Load so it shows up right away.",
              severity: "warning",
              blockId,
              partialBlockId: getPartialBlockId(el),
            });
          }
        }
      });

      return errors;
    },
  },
  {
    name: "form-has-required-field",
    description: "Warns when a lead Form does not contain any required field",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Only the lead `Form` block. `GETForm` is deliberately excluded: it
      // submits optional search filters as URL query params, so having no
      // required field is valid (mirrors the GETForm exclusion in
      // db/actions/page-derived-fields.ts).
      const allForms = canvasDocument.querySelectorAll('[data-block-type="Form"]');

      allForms.forEach((form) => {
        // Check if form has any required fields
        const hasRequiredField = form.querySelector("[required]") !== null;

        if (!hasRequiredField) {
          const blockId = form.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `form-has-required-field-${blockId}`,
              message: "Make at least one field in this form required.",
              severity: "warning",
              blockId,
              partialBlockId: getPartialBlockId(form),
            });
          }
        }
      });

      return errors;
    },
  },
];

// Additional accessibility rules that can be enabled
export const ACCESSIBILITY_RULES: StructureRule[] = [
  {
    name: "image-alt-text",
    description: "Warns if images are missing alt text",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find all images
      const allImages = canvasDocument.querySelectorAll('img[data-block-type="Image"]');

      allImages.forEach((img) => {
        const alt = img.getAttribute("alt");
        if (!alt || alt.trim() === "") {
          const blockId = img.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `image-missing-alt-${blockId}`,
              message: "Add a short description (alt text) to this image for visitors using screen readers.",
              severity: "warning",
              blockId,
              partialBlockId: getPartialBlockId(img),
            });
          }
        }
      });

      return errors;
    },
  },

  {
    name: "button-accessibility",
    description: "Ensures buttons have accessible labels",
    validate: (canvasDocument: Document) => {
      const errors: StructureError[] = [];

      // Find all buttons
      const allButtons = canvasDocument.querySelectorAll('button[data-block-type="Button"]');

      allButtons.forEach((button) => {
        // Check if button has text content, children, or ARIA labels
        const hasTextContent = button.textContent && button.textContent.trim() !== "";
        const hasChildren = button.children.length > 0;
        const hasAriaLabel = (() => {
          const ariaLabel = button.getAttribute("aria-label");
          return ariaLabel !== null && ariaLabel.trim() !== "";
        })();
        const hasAriaLabelledBy = button.hasAttribute("aria-labelledby");

        if (!hasTextContent && !hasChildren && !hasAriaLabel && !hasAriaLabelledBy) {
          const blockId = button.getAttribute("data-block-id");
          if (blockId) {
            errors.push({
              id: `button-no-label-${blockId}`,
              message: "This button is empty. Add text or an icon so visitors know what it does.",
              severity: "warning",
              blockId,
              partialBlockId: getPartialBlockId(button),
            });
          }
        }
      });

      return errors;
    },
  },
];

// Helper function to register custom rules
export class StructureRuleRegistry {
  private rules: StructureRule[] = [...CORE_STRUCTURE_RULES];

  // Replaces a rule with the same name, so re-running a module (e.g. hot reload) doesn't duplicate it.
  addRule(rule: StructureRule): void {
    this.removeRule(rule.name);
    this.rules.push(rule);
  }

  removeRule(name: string): boolean {
    const index = this.rules.findIndex((rule) => rule.name === name);
    if (index > -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  getRules(): StructureRule[] {
    return [...this.rules];
  }

  enableAccessibilityRules(): void {
    this.rules.push(...ACCESSIBILITY_RULES);
  }

  getRuleNames(): string[] {
    return this.rules.map((rule) => rule.name);
  }
}

// Default registry instance
export const defaultRuleRegistry = new StructureRuleRegistry();
