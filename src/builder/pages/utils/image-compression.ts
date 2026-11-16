import Compressor from "compressorjs";
import { toast } from "sonner";

// Maximum size before compression (3MB)
const MAX_COMPRESS_SIZE = 0.5 * 1024 * 1024;
const MAX_AFTER_COMPRESS_SIZE = 10 * 1024 * 1024;

export function formatFileSize(_bytes: number): string {
  const bytes = isNaN(_bytes) ? 0 : typeof _bytes === "number" ? _bytes : parseInt(_bytes);
  if (!bytes || bytes < 0) return "0 B";
  if (bytes < 1024) {
    return `${bytes.toFixed(2)} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

export type CompressorConstructor = new (file: File | Blob, options: Compressor.Options) => unknown;

/**
 * Compress an image file if it's larger than 3MB
 * @param file - The image file to compress
 * @param CompressorImpl - The Compressor implementation; tests pass a stand-in (compressorjs needs a 2D canvas)
 * @returns Promise that resolves to the compressed file or original file if under 3MB
 */
export function compressImageIfNeeded(
  file: File,
  CompressorImpl: CompressorConstructor = Compressor,
): Promise<File | Blob> {
  return new Promise((resolve, reject) => {
    // Check if file is larger than 3MB
    if (file.size <= MAX_COMPRESS_SIZE) {
      // File is already under 3MB, no need to compress
      resolve(file);
      return;
    }

    new CompressorImpl(file, {
      quality: 0.9, // 80% quality
      maxWidth: 2048, // Limit max width
      maxHeight: 2048, // Limit max height
      convertSize: MAX_COMPRESS_SIZE, // Try to keep under 3MB
      success(result) {
        resolve(result);
      },
      error(err) {
        toast.error(
          `Failed to compress image. Image size is ${formatFileSize(file.size)}, which exceeds the maximum allowed size of ${formatFileSize(MAX_AFTER_COMPRESS_SIZE)}.`,
        );
        reject(err);
      },
    });
  });
}
