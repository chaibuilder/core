/**
 * Deprecated names of `<pkg>/ai/openai-compatible`, re-exported by `./openai-compatible.ts`.
 *
 * chaipro makes no breaking changes: a renamed or retired export keeps working from its original
 * import path, with a `@deprecated` notice that names its replacement. Never delete an entry here.
 * See API-CONSISTENCY.md.
 */

export {
  /** @deprecated Use `openAiCompatiblePlugin` from `<pkg>/ai/openai-compatible`. Kept for compatibility. */
  openAiCompatiblePlugin as openAICompatiblePlugin,
} from "~/ai/openai-compatible";
