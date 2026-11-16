import { describe, expect, it } from "vitest";
import {
  CHAI_ASSET_CATEGORIES,
  MEDIA_UPLOADS_DEFAULTS,
  categoryFromExtension,
  categoryFromMime,
  dropzoneAcceptForCategories,
  extensionForMime,
  extensionOf,
  formatMaxSize,
  maxBytesForCategory,
  mimesForCategories,
  mimesForExtension,
  resolveMediaUploadsConfig,
  withExtension,
} from "./ASSET_TYPES";

describe("extensionOf", () => {
  it("lowercases the extension", () => {
    expect(extensionOf("PHOTO.PNG")).toBe("png");
  });

  it("ignores query strings and fragments", () => {
    expect(extensionOf("photo.png?v=2")).toBe("png");
    expect(extensionOf("photo.png#top")).toBe("png");
    expect(extensionOf("photo.png#v=2.5")).toBe("png");
  });

  it("keeps the extension when # or ? appears before the dot in a local name", () => {
    expect(extensionOf("Capture #3.png")).toBe("png");
    expect(extensionOf("IMG#123.jpg")).toBe("jpg");
    expect(extensionOf("notes?draft.txt")).toBe("txt");
  });

  it("takes the last extension of a multi-dot name", () => {
    expect(extensionOf("archive.tar.gz")).toBe("gz");
  });

  it("returns an empty string when there is no extension", () => {
    expect(extensionOf("screenshot")).toBe("");
  });
});

describe("categoryFromExtension", () => {
  it.each([
    ["photo.jpeg", "image"],
    ["clip.MOV", "video"],
    ["song.wav", "audio"],
    ["report.pdf", "document"],
    ["sheet.xlsx", "document"],
  ])("maps %s to %s", (name, category) => {
    expect(categoryFromExtension(name)).toBe(category);
  });

  it("returns undefined for extensions off the whitelist", () => {
    expect(categoryFromExtension("payload.exe")).toBeUndefined();
    expect(categoryFromExtension("archive.zip")).toBeUndefined();
    expect(categoryFromExtension("noextension")).toBeUndefined();
  });
});

describe("categoryFromMime", () => {
  it.each([
    ["image/png", "image"],
    ["video/mp4", "video"],
    ["audio/mpeg", "audio"],
    ["application/pdf", "document"],
    ["text/csv", "document"],
  ])("maps %s to %s", (mime, category) => {
    expect(categoryFromMime(mime)).toBe(category);
  });

  it("falls back to file for unknown or missing mime types", () => {
    expect(categoryFromMime("font/woff2")).toBe("file");
    expect(categoryFromMime(null)).toBe("file");
    expect(categoryFromMime(undefined)).toBe("file");
    expect(categoryFromMime("")).toBe("file");
  });

  it("is case-insensitive", () => {
    expect(categoryFromMime("IMAGE/PNG")).toBe("image");
  });
});

describe("mimesForExtension", () => {
  it("returns the accepted mime types for a known extension", () => {
    expect(mimesForExtension("song.mp3")).toContain("audio/mpeg");
    expect(mimesForExtension("song.mp3")).toContain("audio/mp3");
  });

  it("returns an empty list for an unknown extension", () => {
    expect(mimesForExtension("payload.exe")).toEqual([]);
  });
});

describe("extensionForMime", () => {
  it("resolves the canonical extension", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("video/quicktime")).toBe("mov");
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });

  it("ignores charset parameters and casing", () => {
    expect(extensionForMime("text/plain; charset=utf-8")).toBe("txt");
    expect(extensionForMime("IMAGE/PNG")).toBe("png");
  });

  it("resolves alias mime types to their extension", () => {
    expect(extensionForMime("audio/mp3")).toBe("mp3");
  });

  it("returns undefined for mime types off the whitelist", () => {
    expect(extensionForMime("application/x-msdownload")).toBeUndefined();
    expect(extensionForMime(undefined)).toBeUndefined();
  });
});

describe("withExtension", () => {
  it("appends an extension when the name has none", () => {
    expect(withExtension("sunset over water", "jpg")).toBe("sunset over water.jpg");
  });

  it("replaces a whitelisted extension that disagrees with the bytes", () => {
    expect(withExtension("photo.webp", "png")).toBe("photo.png");
  });

  it("keeps a dotted name that is not a known extension", () => {
    expect(withExtension("v1.2 final", "png")).toBe("v1.2 final.png");
  });

  it("falls back to a generic base for an empty name", () => {
    expect(withExtension("   ", "png")).toBe("asset.png");
  });
});

describe("dropzoneAcceptForCategories", () => {
  it("maps mime types to their extensions", () => {
    const accept = dropzoneAcceptForCategories(["image"]);
    expect(accept["image/png"]).toEqual([".png"]);
    // Both jpg and jpeg share one mime type.
    expect(accept["image/jpeg"]).toEqual(expect.arrayContaining([".jpg", ".jpeg"]));
  });

  it("does not use wildcards, so only whitelisted formats are offered", () => {
    const accept = dropzoneAcceptForCategories(CHAI_ASSET_CATEGORIES);
    expect(Object.keys(accept)).not.toContain("image/*");
    Object.values(accept).forEach((extensions) => expect(extensions.length).toBeGreaterThan(0));
  });

  it("only includes the requested categories", () => {
    const accept = dropzoneAcceptForCategories(["video"]);
    expect(Object.keys(accept)).toEqual(expect.arrayContaining(["video/mp4", "video/webm", "video/quicktime"]));
    expect(accept["image/png"]).toBeUndefined();
  });

  it("returns an empty map for no categories", () => {
    expect(dropzoneAcceptForCategories([])).toEqual({});
  });
});

describe("maxBytesForCategory", () => {
  it("falls back to the default cap", () => {
    expect(maxBytesForCategory("image")).toBe(25 * 1024 * 1024);
    expect(maxBytesForCategory("video")).toBe(50 * 1024 * 1024);
  });

  it("prefers a host override", () => {
    expect(maxBytesForCategory("video", { video: 1024 })).toBe(1024);
  });

  it("ignores overrides for other categories", () => {
    expect(maxBytesForCategory("image", { video: 1024 })).toBe(25 * 1024 * 1024);
  });
});

describe("mimesForCategories", () => {
  it("dedupes mime types shared by several extensions", () => {
    const mimes = mimesForCategories(["image"]);
    expect(mimes.filter((mime) => mime === "image/jpeg")).toHaveLength(1);
  });

  it("covers every category when asked for all of them", () => {
    const mimes = mimesForCategories(CHAI_ASSET_CATEGORIES);
    expect(mimes).toEqual(expect.arrayContaining(["image/png", "video/mp4", "audio/mpeg", "application/pdf"]));
  });
});

describe("formatMaxSize", () => {
  it("formats whole megabytes without decimals", () => {
    expect(formatMaxSize(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("formats partial megabytes with one decimal", () => {
    expect(formatMaxSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("falls back to kilobytes below a megabyte", () => {
    expect(formatMaxSize(512 * 1024)).toBe("512 KB");
  });
});

describe("resolveMediaUploadsConfig", () => {
  it("returns every category at the default caps when unconfigured", () => {
    expect(resolveMediaUploadsConfig()).toEqual(MEDIA_UPLOADS_DEFAULTS);
  });

  it("replaces allowedTypes rather than merging them", () => {
    expect(resolveMediaUploadsConfig({ allowedTypes: ["image"] }).allowedTypes).toEqual(["image"]);
  });

  it("merges maxSizes per category so other caps survive", () => {
    const resolved = resolveMediaUploadsConfig({ maxSizes: { video: 100 * 1024 * 1024 } });
    expect(resolved.maxSizes.video).toBe(100 * 1024 * 1024);
    expect(resolved.maxSizes.image).toBe(MEDIA_UPLOADS_DEFAULTS.maxSizes.image);
  });

  it("treats an empty allowedTypes list as unset", () => {
    expect(resolveMediaUploadsConfig({ allowedTypes: [] }).allowedTypes).toEqual(
      MEDIA_UPLOADS_DEFAULTS.allowedTypes,
    );
  });

  it("does not let a caller mutate the shared defaults", () => {
    const resolved = resolveMediaUploadsConfig();
    resolved.allowedTypes.push("image");
    resolved.maxSizes.image = 1;
    expect(MEDIA_UPLOADS_DEFAULTS.allowedTypes).toEqual(CHAI_ASSET_CATEGORIES);
    expect(MEDIA_UPLOADS_DEFAULTS.maxSizes.image).toBe(25 * 1024 * 1024);
  });
});
