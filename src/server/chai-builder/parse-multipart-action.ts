/**
 * `multipart/form-data` transport for chai actions that carry a file.
 *
 * Base64 in JSON inflates a payload by roughly a third and forces the whole
 * file through a string on both ends, which matters once uploads are video-sized.
 * Multipart avoids that, and since {@link handleHttpAction} only needs an
 * `{action, data}` body, this is purely a parser: auth, permissions and dispatch
 * stay on the single existing path.
 *
 * Wire format:
 * - `action` — the chai action name
 * - `meta`   — JSON object of the non-file fields (optional)
 * - `file`   — the file itself
 */
import { ActionError } from "~/server/chai-actions/action-error";
import type { HttpChaiActionBody } from "~/server/chai-builder/handle-http-action";

export const isMultipartActionRequest = (req: Request): boolean =>
  (req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data");

/**
 * Turn a multipart request into the same body shape the JSON transport produces.
 * `data.file` comes out as bytes, and `data.mimeType` carries what the browser
 * reported — a hint the action layer validates rather than trusts.
 */
export const parseMultipartActionBody = async (req: Request): Promise<HttpChaiActionBody> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ActionError("Malformed multipart request body", "BAD_REQUEST", 400);
  }

  const action = form.get("action");
  if (typeof action !== "string" || !action) {
    throw new ActionError("Missing action in multipart request", "BAD_REQUEST", 400);
  }

  const rawMeta = form.get("meta");
  let meta: Record<string, unknown> = {};
  if (typeof rawMeta === "string" && rawMeta) {
    try {
      const parsed = JSON.parse(rawMeta);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("meta must be a JSON object");
      }
      meta = parsed as Record<string, unknown>;
    } catch {
      throw new ActionError("Invalid meta in multipart request", "BAD_REQUEST", 400);
    }
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    throw new ActionError("Missing file in multipart request", "BAD_REQUEST", 400);
  }

  // `application/octet-stream` is what a client sends when it has no idea what
  // the file is, so it carries no more information than an absent type. Passing
  // it on would fail the mime/extension cross-check for a file whose extension
  // and bytes agree perfectly.
  const declaredMime = file.type && file.type !== "application/octet-stream" ? file.type : undefined;

  // Optional client-rendered preview (a video's first frame). Validated by the
  // action like the file itself; its type is the canvas encoder's, never trusted.
  const thumbnail = form.get("thumbnail");
  const thumbnailPart =
    thumbnail && typeof thumbnail !== "string"
      ? { thumbnail: new Uint8Array(await thumbnail.arrayBuffer()), thumbnailMimeType: thumbnail.type || undefined }
      : {};

  return {
    action,
    // Spread meta first: `file`, `name` and `mimeType` are derived from the
    // uploaded part and must not be overridable by a meta field.
    data: {
      ...meta,
      file: new Uint8Array(await file.arrayBuffer()),
      name: typeof meta.name === "string" && meta.name ? meta.name : file.name,
      mimeType: declaredMime,
      ...thumbnailPart,
    },
  };
};
