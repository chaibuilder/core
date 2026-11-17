import { ChaiAiContext } from "~/types";
import { stripDesignContextKeys } from "~/utils/design-context";

/**
 * Format context data for AI prompt
 * Converts context object (site/page) into formatted string
 */
export function formatContextForPrompt(rawContext?: ChaiAiContext): string {
  // The design-system keys are objects and not part of these prompts (see ~/utils/design-context).
  const context = stripDesignContextKeys(rawContext);
  let contextInfo = "";

  if (context) {
    if (context.site && Object.keys(context.site).length > 0) {
      const siteData = Object.entries(context.site)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      contextInfo += `\nSite Context: ${siteData}`;
    }
    if (context.page && Object.keys(context.page).length > 0) {
      const pageData = Object.entries(context.page)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      contextInfo += `\nPage Context: ${pageData}`;
    }
  }

  return contextInfo;
}

if (import.meta.vitest) {
  describe("formatContextForPrompt", () => {
    describe("With full context", () => {
      it("should format both site and page context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "My Website",
            description: "A great website",
            url: "https://example.com",
          },
          page: {
            title: "Home Page",
            slug: "home",
            description: "Welcome to our site",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Site Context:");
        expect(result).toContain("name: My Website");
        expect(result).toContain("description: A great website");
        expect(result).toContain("url: https://example.com");
        expect(result).toContain("Page Context:");
        expect(result).toContain("title: Home Page");
        expect(result).toContain("slug: home");
        expect(result).toContain("description: Welcome to our site");
      });

      it("should format site context with multiple fields", () => {
        const context: ChaiAiContext = {
          site: {
            name: "E-commerce Store",
            tagline: "Best products online",
            category: "Shopping",
            established: "2020",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Site Context:");
        expect(result).toContain("name: E-commerce Store");
        expect(result).toContain("tagline: Best products online");
        expect(result).toContain("category: Shopping");
        expect(result).toContain("established: 2020");
        expect(result).not.toContain("Page Context:");
      });

      it("should format page context with multiple fields", () => {
        const context: ChaiAiContext = {
          page: {
            title: "Product Details",
            slug: "product-123",
            category: "Electronics",
            price: "$99.99",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Page Context:");
        expect(result).toContain("title: Product Details");
        expect(result).toContain("slug: product-123");
        expect(result).toContain("category: Electronics");
        expect(result).toContain("price: $99.99");
        expect(result).not.toContain("Site Context:");
      });
    });

    describe("With partial context", () => {
      it("should handle only site context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Blog Site",
            author: "John Doe",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Site Context:");
        expect(result).toContain("name: Blog Site");
        expect(result).toContain("author: John Doe");
        expect(result).not.toContain("Page Context:");
      });

      it("should handle only page context", () => {
        const context: ChaiAiContext = {
          page: {
            title: "About Us",
            type: "static",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Page Context:");
        expect(result).toContain("title: About Us");
        expect(result).toContain("type: static");
        expect(result).not.toContain("Site Context:");
      });

      it("should handle empty site object", () => {
        const context: ChaiAiContext = {
          site: {},
          page: {
            title: "Contact",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).not.toContain("Site Context:");
        expect(result).toContain("Page Context:");
        expect(result).toContain("title: Contact");
      });

      it("should handle empty page object", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Company Site",
          },
          page: {},
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Site Context:");
        expect(result).toContain("name: Company Site");
        expect(result).not.toContain("Page Context:");
      });
    });

    describe("With no context", () => {
      it("should return empty string when context is undefined", () => {
        const result = formatContextForPrompt(undefined);

        expect(result).toBe("");
      });

      it("should return empty string when context is empty object", () => {
        const context: ChaiAiContext = {};

        const result = formatContextForPrompt(context);

        expect(result).toBe("");
      });

      it("should return empty string when both site and page are undefined", () => {
        const context: ChaiAiContext = {
          site: undefined,
          page: undefined,
        };

        const result = formatContextForPrompt(context);

        expect(result).toBe("");
      });
    });

    describe("Formatting details", () => {
      it("should separate fields with commas", () => {
        const context: ChaiAiContext = {
          site: {
            field1: "value1",
            field2: "value2",
            field3: "value3",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("field1: value1, field2: value2, field3: value3");
      });

      it("should start with newline for site context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Test",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toMatch(/^\nSite Context:/);
      });

      it("should start with newline for page context when no site", () => {
        const context: ChaiAiContext = {
          page: {
            title: "Test",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toMatch(/^\nPage Context:/);
      });

      it("should have both contexts on separate lines", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Site",
          },
          page: {
            title: "Page",
          },
        };

        const result = formatContextForPrompt(context);

        const lines = result.split("\n");
        expect(lines.length).toBeGreaterThan(2);
        expect(result).toContain("\nSite Context:");
        expect(result).toContain("\nPage Context:");
      });
    });

    describe("Special characters and values", () => {
      it("should handle special characters in values", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Site & Company",
            description: "We're #1!",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("name: Site & Company");
        expect(result).toContain("description: We're #1!");
      });

      it("should handle numeric values", () => {
        const context: ChaiAiContext = {
          page: {
            views: 1000,
            rating: 4.5,
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("views: 1000");
        expect(result).toContain("rating: 4.5");
      });

      it("should handle boolean values", () => {
        const context: ChaiAiContext = {
          page: {
            published: true,
            featured: false,
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("published: true");
        expect(result).toContain("featured: false");
      });

      it("should handle null values", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Test",
            logo: null,
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("name: Test");
        expect(result).toContain("logo: null");
      });

      it("should handle empty string values", () => {
        const context: ChaiAiContext = {
          page: {
            title: "Page",
            subtitle: "",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("title: Page");
        expect(result).toContain("subtitle: ");
      });

      it("should handle URLs and special paths", () => {
        const context: ChaiAiContext = {
          site: {
            url: "https://example.com/path?query=value",
            api: "https://api.example.com/v1",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("url: https://example.com/path?query=value");
        expect(result).toContain("api: https://api.example.com/v1");
      });
    });

    describe("Design-system keys", () => {
      it("formats a context carrying a design system exactly like one without it", () => {
        const plain: ChaiAiContext = { site: { siteContext: "Bakery", tone: "Warm" }, page: { pageContext: "Menu" } };
        const withDesign: ChaiAiContext = {
          site: { ...plain.site, designSystem: { northStar: "Flour and fire", enabled: true } },
          page: { ...plain.page, designBrief: { mode: "persuade", thesis: "Bread first" } },
        };
        expect(formatContextForPrompt(withDesign)).toBe(formatContextForPrompt(plain));
        expect(formatContextForPrompt(withDesign)).not.toContain("[object Object]");
      });
    });

    describe("Real-world scenarios", () => {
      it("should format e-commerce site context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "TechStore",
            category: "Electronics",
            currency: "USD",
          },
          page: {
            title: "iPhone 15 Pro",
            category: "Smartphones",
            price: "$999",
            inStock: true,
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("Site Context: name: TechStore, category: Electronics, currency: USD");
        expect(result).toContain(
          "Page Context: title: iPhone 15 Pro, category: Smartphones, price: $999, inStock: true",
        );
      });

      it("should format blog site context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "Tech Blog",
            author: "Jane Smith",
            niche: "Web Development",
          },
          page: {
            title: "Getting Started with React",
            publishDate: "2024-01-15",
            readTime: "5 min",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("name: Tech Blog");
        expect(result).toContain("author: Jane Smith");
        expect(result).toContain("title: Getting Started with React");
        expect(result).toContain("publishDate: 2024-01-15");
      });

      it("should format landing page context", () => {
        const context: ChaiAiContext = {
          site: {
            name: "SaaS Product",
            industry: "Marketing",
          },
          page: {
            title: "Pricing Plans",
            type: "landing",
            cta: "Start Free Trial",
          },
        };

        const result = formatContextForPrompt(context);

        expect(result).toContain("name: SaaS Product");
        expect(result).toContain("title: Pricing Plans");
        expect(result).toContain("cta: Start Free Trial");
      });
    });
  });
}
