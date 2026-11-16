import { compressImageIfNeeded } from "~/builder/pages/utils/image-compression";
import { categoryFromExtension } from "~/constants/ASSET_TYPES";

/**
 * Client-side upload preparation shared by the media manager's uploader and the
 * sidebar media panel: which transport a file takes, and the payload each one
 * expects. Keeping both drop zones on these helpers is what keeps their limits
 * and their stored metadata identical.
 */

/**
 * SVGs still cross the JSON action endpoint, which sits under nginx's *global*
 * `client_max_body_size 25m` — so their ceiling is this, not the streamed one.
 */
export const BASE64_PATH_MAX_SIZE = 25 * 1024 * 1024;

export const isSvgFile = (file: File) => file.type === "image/svg+xml";

/** Longest edge of the poster captured for a video upload. */
const POSTER_MAX_EDGE = 320;
/** A browser that cannot decode the file may never fire `error`; give up instead of hanging the upload. */
const POSTER_TIMEOUT_MS = 10_000;

export type VideoPoster = { blob: Blob; width: number; height: number };

/**
 * First frame of a video as a small image, drawn from the browser's own
 * decoder — no server-side ffmpeg. Takes the file being uploaded, or the URL of
 * a stored one (the backfill for rows without a poster: MCP uploads, older
 * rows). `undefined` when the browser cannot decode it (unsupported codec,
 * corrupt bytes), or, for a URL, when the bucket sends no CORS headers: a
 * cross-origin frame can be drawn but not read back, so the capture needs
 * `crossOrigin="anonymous"` and a bucket that allows the builder's origin.
 */
export const captureVideoPoster = (source: File | string): Promise<VideoPoster | undefined> =>
  new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(undefined);
    const objectUrl = typeof source === "string" ? undefined : URL.createObjectURL(source);
    const video = document.createElement("video");
    let settled = false;
    const done = (poster?: VideoPoster) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(poster);
    };
    const timer = setTimeout(() => done(), POSTER_TIMEOUT_MS);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (typeof source === "string") video.crossOrigin = "anonymous";
    video.onerror = () => done();
    // Seek past 0: the very first frame of many encodes is black.
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0);
    };
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) return done();
      const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) return done();
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        // A browser without WebP encoding (older Safari) silently returns PNG; the
        // blob's own `type` travels with it, so the server stores whichever it got.
        canvas.toBlob((blob) => done(blob ? { blob, width, height } : undefined), "image/webp", 0.8);
      } catch {
        // SecurityError: the frame came from a bucket without CORS, so the canvas is tainted.
        done();
      }
    };
    video.src = objectUrl ?? (source as string);
  });

/** The poster as a base64 data URL, for the JSON action transport. */
export const posterToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Base64 payloads for the SVG path — unchanged from how this always worked. */
export const readFilesAsDataUrls = (files: File[], optimize: boolean) =>
  Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () =>
            resolve({ file: reader.result as string, folderId: undefined, name: file.name, optimize });
          reader.onerror = () => reject(null);
        }),
    ),
  );

export type StreamUploadPayload = {
  file: File | Blob;
  name: string;
  folderId: undefined;
  width?: number;
  height?: number;
  thumbnail?: Blob;
};

/**
 * Measures the file and hands back the blob itself — never a base64 string. Dimensions
 * are read from the *processed* blob, and its `type` is what gets sent, because
 * compression can change the format. A video is sent as-is, with a poster captured
 * from its first frame as the thumbnail.
 */
export const toStreamUpload = async (file: File, optimize: boolean): Promise<StreamUploadPayload> => {
  // By extension, not `file.type`: browsers report no mime for some `.mov` files.
  if (categoryFromExtension(file.name) === "video") {
    const poster = await captureVideoPoster(file);
    return {
      file,
      name: file.name,
      folderId: undefined,
      width: poster?.width,
      height: poster?.height,
      thumbnail: poster?.blob,
    };
  }

  const processedFile: File | Blob = optimize ? await compressImageIfNeeded(file) : file;

  let width: number | undefined;
  let height: number | undefined;
  try {
    const bitmap = await createImageBitmap(processedFile);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
  } catch {
    // Dimensions are optional metadata; a failure here must not fail the upload.
  }

  return { file: processedFile, name: file.name, folderId: undefined, width, height };
};
