"use client";

// Direct: dynamic({ ssr: false }) rendered a client-only Suspense
// scaffold the server HTML didn't contain, failing hydration of the whole
// page. The banner is SSR-safe (`window` only inside its click handler) and
// renders null when `show` is false, so both sides emit identical markup.
export { ChaiPreviewBanner } from "~/render/rsc/preview-banner";

// Deprecated names, kept for compatibility. See ./render-client.deprecated.ts.
export * from "./render-client.deprecated";
