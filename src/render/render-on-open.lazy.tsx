"use client";

import dynamic from "next/dynamic";

/**
 * Client-side lazy boundary for RenderOnOpen: the renderer reaches it from
 * every public page, so without this "use client" next/dynamic module it would
 * ship in every page's initial JS, even on pages that opt no panel in. SSR
 * stays on (no `ssr: false`, no fallback), so the server still emits the
 * marker and only the JS defers.
 */
const RenderOnOpenLazy = dynamic(() => import("./render-on-open").then((m) => m.RenderOnOpen));

export { RenderOnOpenLazy as RenderOnOpen };
