/**
 * @vitest-environment happy-dom
 */
import type Compressor from "compressorjs";
import { compressImageIfNeeded, formatFileSize, type CompressorConstructor } from "./image-compression";

/**
 * Stand-in for compressorjs (happy-dom has no 2D canvas, so the real one cannot run). Calls the
 * options' `success` or `error` callback asynchronously, as the real Compressor does, and records
 * every construction.
 */
const makeCompressor = (outcome: { success: Blob } | { error: Error }) => {
  const constructed: { file: File | Blob; options: Compressor.Options }[] = [];
  const Impl = class {
    constructor(file: File | Blob, options: Compressor.Options) {
      constructed.push({ file, options });
      void Promise.resolve().then(() =>
        "success" in outcome ? options.success?.(outcome.success) : options.error?.(outcome.error),
      );
    }
  } satisfies CompressorConstructor;
  return { Impl, constructed };
};

describe("formatFileSize", () => {
  it("should format 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("should format bytes less than 1KB", () => {
    expect(formatFileSize(100)).toBe("100.00 B");
    expect(formatFileSize(512)).toBe("512.00 B");
    expect(formatFileSize(1023)).toBe("1023.00 B");
  });

  it("should format kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.00 KB");
    expect(formatFileSize(2048)).toBe("2.00 KB");
    expect(formatFileSize(512 * 1024)).toBe("512.00 KB");
  });

  it("should format megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.00 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.00 MB");
    expect(formatFileSize(10.5 * 1024 * 1024)).toBe("10.50 MB");
  });

  it("should handle NaN values", () => {
    expect(formatFileSize(NaN)).toBe("0 B");
  });

  it("should handle string numbers", () => {
    expect(formatFileSize("1024" as any)).toBe("1.00 KB");
    expect(formatFileSize("2097152" as any)).toBe("2.00 MB");
  });

  it("should handle invalid string values", () => {
    expect(formatFileSize("invalid" as any)).toBe("0 B");
  });

  it("should handle negative values", () => {
    expect(formatFileSize(-100)).toBe("0 B");
  });

  it("should format decimal values correctly", () => {
    expect(formatFileSize(1536)).toBe("1.50 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.50 MB");
  });

  it("should handle edge case at KB boundary", () => {
    expect(formatFileSize(1023.99)).toBe("1023.99 B");
    expect(formatFileSize(1024.01)).toBe("1.00 KB");
  });

  it("should handle edge case at MB boundary", () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.00 KB");
    expect(formatFileSize(1024 * 1024 + 1)).toBe("1.00 MB");
  });
});

describe("compressImageIfNeeded", () => {
  const compressed = () => new Blob(["compressed"], { type: "image/jpeg" });

  it("should return original file if size is under MAX_COMPRESS_SIZE (0.5MB)", async () => {
    const { Impl, constructed } = makeCompressor({ success: compressed() });
    const smallFile = new File(["x".repeat(100000)], "small.jpg", { type: "image/jpeg" });
    const result = await compressImageIfNeeded(smallFile, Impl);
    expect(result).toBe(smallFile);
    expect(constructed).toHaveLength(0);
  });

  it("should return original file if size equals MAX_COMPRESS_SIZE", async () => {
    const { Impl, constructed } = makeCompressor({ success: compressed() });
    const exactFile = new File(["x".repeat(0.5 * 1024 * 1024)], "exact.jpg", { type: "image/jpeg" });
    const result = await compressImageIfNeeded(exactFile, Impl);
    expect(result).toBe(exactFile);
    expect(constructed).toHaveLength(0);
  });

  it("should attempt compression for files larger than MAX_COMPRESS_SIZE", async () => {
    const output = compressed();
    const { Impl, constructed } = makeCompressor({ success: output });
    const largeFile = new File(["x".repeat(1 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" });

    const result = await compressImageIfNeeded(largeFile, Impl);

    expect(result).toBeInstanceOf(Blob);
    expect(result).toBe(output);
    expect(constructed).toHaveLength(1);
    expect(constructed[0].file).toBe(largeFile);
  });

  it("should handle compression errors", async () => {
    const { Impl } = makeCompressor({ error: new Error("Compression failed") });
    const largeFile = new File(["x".repeat(1 * 1024 * 1024)], "large.jpg", { type: "image/jpeg" });

    await expect(compressImageIfNeeded(largeFile, Impl)).rejects.toThrow("Compression failed");
  });

  it("should handle very small files (< 1KB)", async () => {
    const tinyFile = new File(["tiny"], "tiny.jpg", { type: "image/jpeg" });
    const result = await compressImageIfNeeded(tinyFile);
    expect(result).toBe(tinyFile);
  });

  it("should handle empty files", async () => {
    const emptyFile = new File([], "empty.jpg", { type: "image/jpeg" });
    const result = await compressImageIfNeeded(emptyFile);
    expect(result).toBe(emptyFile);
  });

  it("should handle files at exactly 0.5MB boundary", async () => {
    const boundaryFile = new File(["x".repeat(0.5 * 1024 * 1024)], "boundary.jpg", {
      type: "image/jpeg",
    });
    const result = await compressImageIfNeeded(boundaryFile);
    expect(result).toBe(boundaryFile);
  });

  it("should handle files just over 0.5MB boundary", async () => {
    const { Impl, constructed } = makeCompressor({ success: compressed() });
    const overBoundaryFile = new File(["x".repeat(0.5 * 1024 * 1024 + 1)], "over.jpg", {
      type: "image/jpeg",
    });

    const result = await compressImageIfNeeded(overBoundaryFile, Impl);
    expect(result).toBeInstanceOf(Blob);
    expect(constructed).toHaveLength(1);
  });

  it("should handle different image types", async () => {
    const pngFile = new File(["x".repeat(100)], "image.png", { type: "image/png" });
    const result = await compressImageIfNeeded(pngFile);
    expect(result).toBe(pngFile);
  });

  it("should preserve file metadata for small files", async () => {
    const file = new File(["content"], "test.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
    expect((result as File).name).toBe("test.jpg");
  });
});
