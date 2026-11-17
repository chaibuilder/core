/**
 * Utility functions for handling page slugs
 */

import { CHAI_LANGUAGES } from "~/constants/LANGUAGES";

/**
 * Converts free text (e.g. a page title) into a URL-safe slug segment.
 * Same rules the SlugInput enforces: letters, numbers, hyphens, underscores
 * and dots only; spaces become hyphens; lowercased.
 * @param input The text to slugify
 * @returns The slugified string
 */
export const slugify = (input: string): string => {
  return input
    .trim()
    .replace(/\//g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_.]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .toLowerCase();
};

/**
 * Extracts the file extension from a slug if present
 * @param slug The slug to extract extension from
 * @returns Object containing the base slug and extension
 */
export const extractSlugExtension = (slug: string): { base: string; extension: string | null } => {
  if (!slug) return { base: slug, extension: null };

  // Find the last dot in the slug
  const lastDotIndex = slug.lastIndexOf(".");

  // If there's no dot or it's the first character, return the original slug
  if (lastDotIndex <= 0) return { base: slug, extension: null };

  // Extract the extension and base
  const extension = slug.substring(lastDotIndex);
  const base = slug.substring(0, lastDotIndex);

  return { base, extension };
};

/**
 * Removes file extension from a slug
 * @param slug The slug to clean
 * @returns The slug without extension
 */
export const removeSlugExtension = (slug: string): string => {
  if (!slug) return slug;
  const { base } = extractSlugExtension(slug);
  return base;
};

/**
 * Formats a parent slug for display or selection
 * @param slug The parent slug
 * @returns The formatted parent slug without extension
 */

/**
 * Parses a slug for edit mode, returning the initial slug and prefix flag.
 * Mirrors the logic from AddNewLanguagePage.
 * @param fullSlug The full slug string
 * @param primaryPageObject The primary page object (must have .slug and .parent)
 * @param LANGUAGES A map of language codes
 * @returns { initSlug: string, prefix: boolean }
 */
export function parseSlugForEdit(
  fullSlug: string,
  primaryPageObject: { slug: string; parent?: any },
): { initSlug: string; prefix: boolean } {
  const splittedSlugs = (fullSlug || "").split("/").filter(Boolean);
  let initSlug = "";
  let prefix = true;
  if (primaryPageObject.slug === "/") {
    const last = splittedSlugs.pop() || "";
    if (CHAI_LANGUAGES[last]) {
      prefix = true;
    } else {
      initSlug = last;
      const langCode = splittedSlugs.pop() || "";
      prefix = !!CHAI_LANGUAGES[langCode];
    }
  } else if (!primaryPageObject.parent) {
    if (splittedSlugs.length) {
      initSlug = splittedSlugs.pop() || "";
      const langCode = splittedSlugs.pop() || "";
      prefix = !!CHAI_LANGUAGES[langCode];
    }
  } else {
    if (splittedSlugs.length) {
      initSlug = splittedSlugs.pop() || "";
    }
  }
  return { initSlug, prefix };
}

/**
 * Formats a parent slug for display or selection
 * @param slug The parent slug
 * @returns The formatted parent slug without extension
 */
export const formatParentSlug = (slug: string): string => {
  if (!slug) return slug;
  return removeSlugExtension(slug);
};

/**
 * Combines parent and child slugs into a final slug
 * @param parentSlug The parent page slug
 * @param childSlug The child page slug
 * @returns The combined slug
 */
export const combineParentChildSlugs = (parentSlug: string, childSlug: string): string => {
  const cleanParentSlug = removeSlugExtension(parentSlug || "");

  if (!cleanParentSlug || cleanParentSlug === "/") {
    return `/${childSlug}`;
  }

  return `${cleanParentSlug}/${childSlug}`;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("slugify", () => {
    it("should slugify plain titles", () => {
      expect(slugify("About Us")).toBe("about-us");
      expect(slugify("Contact")).toBe("contact");
    });

    it("should strip disallowed characters", () => {
      expect(slugify("Hello, World!")).toBe("hello-world-");
      expect(slugify("Pricing & Plans")).toBe("pricing-plans");
    });

    it("should remove slashes and collapse hyphens", () => {
      expect(slugify("a/b c")).toBe("ab-c");
      expect(slugify("--Already--Dashed--")).toBe("already-dashed-");
    });

    it("should handle empty input", () => {
      expect(slugify("")).toBe("");
    });

    it("should ignore leading and trailing whitespace", () => {
      expect(slugify("  About Us  ")).toBe("about-us");
    });
  });

  describe("extractSlugExtension", () => {
    it("should extract extension from slug with extension", () => {
      expect(extractSlugExtension("about.html")).toEqual({ base: "about", extension: ".html" });
      expect(extractSlugExtension("contact.php")).toEqual({ base: "contact", extension: ".php" });
      expect(extractSlugExtension("page.aspx")).toEqual({ base: "page", extension: ".aspx" });
    });

    it("should handle slugs without extension", () => {
      expect(extractSlugExtension("about")).toEqual({ base: "about", extension: null });
      expect(extractSlugExtension("contact-us")).toEqual({ base: "contact-us", extension: null });
    });

    it("should handle empty or invalid slugs", () => {
      expect(extractSlugExtension("")).toEqual({ base: "", extension: null });
      expect(extractSlugExtension(".hidden")).toEqual({ base: ".hidden", extension: null });
    });

    it("should handle multiple dots correctly", () => {
      expect(extractSlugExtension("my.page.html")).toEqual({ base: "my.page", extension: ".html" });
      expect(extractSlugExtension("archive.tar.gz")).toEqual({ base: "archive.tar", extension: ".gz" });
    });
  });

  describe("removeSlugExtension", () => {
    it("should remove extension from slug", () => {
      expect(removeSlugExtension("about.html")).toBe("about");
      expect(removeSlugExtension("contact.php")).toBe("contact");
    });

    it("should return slug unchanged if no extension", () => {
      expect(removeSlugExtension("about")).toBe("about");
      expect(removeSlugExtension("contact-us")).toBe("contact-us");
    });

    it("should handle empty slug", () => {
      expect(removeSlugExtension("")).toBe("");
    });

    it("should handle multiple dots", () => {
      expect(removeSlugExtension("my.page.html")).toBe("my.page");
    });
  });

  describe("parseSlugForEdit", () => {
    it("should parse slug for root page with language prefix", () => {
      const result = parseSlugForEdit("/en/about", { slug: "/" });
      expect(result).toEqual({ initSlug: "about", prefix: true });
    });

    it("should parse slug for root page without language prefix", () => {
      const result = parseSlugForEdit("/about", { slug: "/" });
      expect(result).toEqual({ initSlug: "about", prefix: false });
    });

    it("should parse slug for root page with only language code", () => {
      const result = parseSlugForEdit("/en", { slug: "/" });
      expect(result).toEqual({ initSlug: "", prefix: true });
    });

    it("should parse slug for top-level page with language prefix", () => {
      const result = parseSlugForEdit("/en/about", { slug: "/about" });
      expect(result).toEqual({ initSlug: "about", prefix: true });
    });

    it("should parse slug for top-level page without language prefix", () => {
      const result = parseSlugForEdit("/about", { slug: "/about" });
      expect(result).toEqual({ initSlug: "about", prefix: false });
    });

    it("should parse slug for child page", () => {
      const result = parseSlugForEdit("/parent/child", { slug: "/parent/child", parent: {} });
      expect(result).toEqual({ initSlug: "child", prefix: true });
    });

    it("should handle empty slug", () => {
      const result = parseSlugForEdit("", { slug: "/" });
      expect(result).toEqual({ initSlug: "", prefix: false });
    });

    it("should handle slug with trailing slash", () => {
      const result = parseSlugForEdit("/en/about/", { slug: "/" });
      expect(result).toEqual({ initSlug: "about", prefix: true });
    });
  });

  describe("formatParentSlug", () => {
    it("should remove extension from parent slug", () => {
      expect(formatParentSlug("/parent.html")).toBe("/parent");
      expect(formatParentSlug("/about.php")).toBe("/about");
    });

    it("should return slug unchanged if no extension", () => {
      expect(formatParentSlug("/parent")).toBe("/parent");
      expect(formatParentSlug("/about")).toBe("/about");
    });

    it("should handle empty slug", () => {
      expect(formatParentSlug("")).toBe("");
    });
  });

  describe("combineParentChildSlugs", () => {
    it("should combine parent and child slugs", () => {
      expect(combineParentChildSlugs("/parent", "child")).toBe("/parent/child");
      expect(combineParentChildSlugs("/about", "team")).toBe("/about/team");
    });

    it("should handle parent slug with extension", () => {
      expect(combineParentChildSlugs("/parent.html", "child")).toBe("/parent/child");
    });

    it("should handle root parent slug", () => {
      expect(combineParentChildSlugs("/", "child")).toBe("/child");
      expect(combineParentChildSlugs("", "child")).toBe("/child");
    });

    it("should handle empty parent slug", () => {
      expect(combineParentChildSlugs("", "child")).toBe("/child");
    });

    it("should handle nested parent slugs", () => {
      expect(combineParentChildSlugs("/parent/subparent", "child")).toBe("/parent/subparent/child");
    });

    it("should handle parent slug with multiple dots", () => {
      expect(combineParentChildSlugs("/parent.page.html", "child")).toBe("/parent.page/child");
    });
  });
}
