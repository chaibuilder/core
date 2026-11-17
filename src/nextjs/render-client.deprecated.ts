/**
 * Deprecated names of `<pkg>/nextjs/render-client`, re-exported by `./render-client.tsx`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `ChaiPreviewBanner` from `<pkg>/nextjs/render-client`. Kept for compatibility. */
  ChaiPreviewBanner as PreviewBanner,
} from "~/render/rsc/preview-banner";
