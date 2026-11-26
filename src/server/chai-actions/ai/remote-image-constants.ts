/**
 * Pure constants shared by client-safe `upload_image` schemas and the
 * server-only remote-image fetcher. No node imports.
 */

/** Largest image the server will fetch from a sourceUrl. */
export const MCP_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

/** Per-hop budget covering DNS resolution and the fetch. */
export const MCP_IMAGE_TIMEOUT_MS = 15_000;

export const formatBytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;
