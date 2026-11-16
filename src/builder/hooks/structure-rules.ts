export type StructureError = {
  id: string;
  message: string;
  severity: "error" | "warning";
  blockId?: string;
  partialBlockId?: string;
};

export type StructureRule = {
  name: string;
  description: string;
  validate: (canvasDocument: Document) => StructureError[];
};

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
            message: "Box (div) cannot be nested inside Paragraph elements",
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
            message: "Link cannot be nested inside another interactive element (link or button with link)",
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
            message: "Link cannot be nested inside another interactive element (link or button with link)",
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
              message: "List Item must be inside a List container",
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
              message:
                "Table Cell must be inside a Table Row, which must be inside Table Head/Body, which must be inside a Table",
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
              message: "Table Row must be inside a Table (Table Head or Table Body)",
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
              message: "Table Head/Body must be inside a Table",
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
            message: "Button cannot be nested inside another button",
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
            message: "Form cannot be nested inside another form",
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
            message: "Paragraph cannot be nested inside another paragraph",
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
            message: `Heading level skipped: h${previous.level} followed by h${current.level}. Consider using h${previous.level + 1}`,
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
              message: "Avoid using animations on above-the-fold content for better performance and SEO",
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
              message: "Avoid lazy loading above-the-fold images for better LCP (Largest Contentful Paint)",
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
              message: "Form should contain at least one required field.",
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
              message: "Image should have alt text for accessibility",
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
              message: "Button should have accessible content (text or icon)",
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
