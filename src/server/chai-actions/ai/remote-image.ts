/**
 * Turning a client's `dataUrl` / `sourceUrl` argument into image bytes with SSRF guards,
 * plus shared media-library asset upload logic for Builder AI and MCP `upload_image`.
 *
 * Known limitation: DNS rebinding between the address check and the fetch.
 * Closing it fully needs a pinned-IP connection with a manual Host header,
 * which breaks TLS SNI and certificate validation — the same trade-off made
 * for authenticated, `assets:create`-permissioned callers (MCP tokens and
 * authenticated Builder AI sessions).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extensionForMime, withExtension } from "~/constants/ASSET_TYPES";
import { MCP_IMAGE_MAX_BYTES, MCP_IMAGE_TIMEOUT_MS, formatBytes } from "./remote-image-constants";

export { MCP_IMAGE_MAX_BYTES, MCP_IMAGE_TIMEOUT_MS, formatBytes };

/** Hops followed after the first request. */
export const MCP_IMAGE_MAX_REDIRECTS = 3;

export type RemoteImage = {
  bytes: Uint8Array;
  mimeType: string;
  finalUrl?: string;
};

export type ImageSourceResult = { ok: true; image: RemoteImage } | { ok: false; message: string };

const fail = (message: string): ImageSourceResult => ({
  ok: false,
  message: `Error: ${message}`,
});

const BLOCKED_IPV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  return BLOCKED_IPV4.some(([network, prefix]) => {
    const base = ipv4ToInt(network);
    if (base === null) return false;
    const size = 2 ** (32 - prefix);
    return value >= base && value < base + size;
  });
}

export function parseIpv6(ip: string): number[] | null {
  let text = ip.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  text = text.split("%")[0];
  if (!text) return null;

  let tail = "";
  const lastColon = text.lastIndexOf(":");
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const value = ipv4ToInt(maybeV4);
    if (value === null) return null;
    tail = `${Math.floor(value / 0x10000).toString(16)}:${(value % 0x10000).toString(16)}`;
    text = `${text.slice(0, lastColon + 1)}${tail}`;
  }

  const doubleColonParts = text.split("::");
  if (doubleColonParts.length > 2) return null;

  const toGroups = (segment: string): number[] | null => {
    if (!segment) return [];
    const groups: number[] = [];
    for (const part of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  if (doubleColonParts.length === 1) {
    const groups = toGroups(text);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = toGroups(doubleColonParts[0]);
  const rest = toGroups(doubleColonParts[1]);
  if (!head || !rest) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...rest];
}

function ipv4FromGroups(groups: number[], start: number): string {
  const high = groups[start];
  const low = groups[start + 1];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function embeddedIpv4(groups: number[]): string {
  return ipv4FromGroups(groups, 6);
}

const isNat64Shape = (groups: number[]) => groups.slice(2, 6).every((group) => group === 0);

function isBlockedIpv6(ip: string): boolean {
  const groups = parseIpv6(ip);
  if (!groups) return true;

  const isZeroPrefix = (count: number) => groups.slice(0, count).every((group) => group === 0);

  if (groups.every((group) => group === 0)) return true;
  if (isZeroPrefix(7) && groups[7] === 1) return true;

  if (isZeroPrefix(5) && groups[5] === 0xffff) return isBlockedIpv4(embeddedIpv4(groups));
  if (isZeroPrefix(6)) return isBlockedIpv4(embeddedIpv4(groups));
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && isNat64Shape(groups)) return isBlockedIpv4(embeddedIpv4(groups));

  if (groups[0] === 0x2002) return isBlockedIpv4(ipv4FromGroups(groups, 1));
  if (groups[0] === 0x2001 && groups[1] === 0x0000) {
    if (isBlockedIpv4(ipv4FromGroups(groups, 2))) return true;
    const client = [groups[6] ^ 0xffff, groups[7] ^ 0xffff];
    return isBlockedIpv4(ipv4FromGroups([...groups.slice(0, 6), ...client], 6));
  }

  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0002 && groups[2] === 0) return true;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) return true;

  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const value = address.trim().replace(/^\[|\]$/g, "");
  const version = isIP(value);
  if (version === 4) return isBlockedIpv4(value);
  if (version === 6) return isBlockedIpv6(value);
  return true;
}

export type UrlCheckResult = { ok: true; url: URL } | { ok: false; message: string };

export function checkImageUrlShape(raw: string): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: "Error: sourceUrl is not a valid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      message: `Error: sourceUrl must be an http or https URL (got "${url.protocol}").`,
    };
  }

  if (url.username || url.password) {
    return { ok: false, message: "Error: sourceUrl must not contain credentials." };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return { ok: false, message: "Error: sourceUrl has no host." };

  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return { ok: false, message: "Error: sourceUrl must point to a public host." };
  }

  if (isIP(hostname) && isBlockedIpAddress(hostname)) {
    return { ok: false, message: `Error: sourceUrl resolves to a non-public address (${hostname}).` };
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return {
      ok: false,
      message: `Error: sourceUrl must use the default http/https port (got port ${url.port}).`,
    };
  }

  return { ok: true, url };
}

type LookupAddresses = (hostname: string) => Promise<string[]>;

const defaultLookupAddresses: LookupAddresses = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export async function validateImageUrl(
  raw: string,
  lookupAddresses: LookupAddresses = defaultLookupAddresses,
  timeoutMs: number = MCP_IMAGE_TIMEOUT_MS,
): Promise<UrlCheckResult> {
  const shape = checkImageUrlShape(raw);
  if (!shape.ok) return shape;

  const hostname = shape.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return shape;

  let addresses: string[];
  try {
    addresses = await withDeadline(lookupAddresses(hostname), timeoutMs);
  } catch {
    return { ok: false, message: `Error: could not resolve the host of sourceUrl (${hostname}).` };
  }

  if (addresses.length === 0) {
    return { ok: false, message: `Error: could not resolve the host of sourceUrl (${hostname}).` };
  }

  const blocked = addresses.find((address) => isBlockedIpAddress(address));
  if (blocked) {
    return { ok: false, message: `Error: sourceUrl resolves to a non-public address (${blocked}).` };
  }

  return shape;
}

export function parseImageDataUrl(value: string, maxBytes: number = MCP_IMAGE_MAX_BYTES): ImageSourceResult {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(value.trim());
  if (!match) {
    return fail('dataUrl must be a base64 data URL, e.g. "data:image/png;base64,iVBORw0K…".');
  }

  const [, rawMime, params, payload] = match;
  if (
    !params
      .split(";")
      .map((param) => param.trim().toLowerCase())
      .includes("base64")
  ) {
    return fail('dataUrl must be base64-encoded (";base64," before the data).');
  }

  const mimeType = rawMime.trim().toLowerCase();
  if (!mimeType.startsWith("image/")) {
    return fail(`dataUrl must declare an image media type (got "${mimeType || "none"}").`);
  }

  const compact = payload.replace(/\s+/g, "");
  if (!compact) return fail("dataUrl carries no data.");
  const padding = compact.match(/=+$/)?.[0].length ?? 0;
  if (Math.floor((compact.length * 3) / 4) - padding > maxBytes) {
    return fail(
      `the image is larger than the ${formatBytes(maxBytes)} limit. Use sourceUrl, or upload a smaller image.`,
    );
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return fail("dataUrl payload is not valid base64.");
  }

  const bytes = new Uint8Array(Buffer.from(compact, "base64"));
  if (bytes.byteLength === 0) return fail("dataUrl decoded to zero bytes.");
  if (bytes.byteLength > maxBytes) {
    return fail(
      `the image is larger than the ${formatBytes(maxBytes)} limit. Use sourceUrl, or upload a smaller image.`,
    );
  }

  return { ok: true, image: { bytes, mimeType } };
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

async function readCappedBody(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export type FetchRemoteImageOptions = {
  fetchImpl?: typeof fetch;
  lookupAddresses?: LookupAddresses;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
};

export async function fetchRemoteImage(raw: string, options: FetchRemoteImageOptions = {}): Promise<ImageSourceResult> {
  const {
    fetchImpl = fetch,
    lookupAddresses = defaultLookupAddresses,
    maxBytes = MCP_IMAGE_MAX_BYTES,
    maxRedirects = MCP_IMAGE_MAX_REDIRECTS,
    timeoutMs = MCP_IMAGE_TIMEOUT_MS,
  } = options;

  let target = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const hopDeadline = Date.now() + timeoutMs;
    const validated = await validateImageUrl(target, lookupAddresses, timeoutMs);
    if (!validated.ok) return { ok: false, message: validated.message };

    let response: Response;
    try {
      response = await fetchImpl(validated.url.toString(), {
        redirect: "manual",
        headers: { accept: "image/*" },
        signal: AbortSignal.timeout(Math.max(0, hopDeadline - Date.now())),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return fail(`could not download the image from sourceUrl (${reason}).`);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      await discardBody(response);
      const location = response.headers.get("location");
      if (!location) {
        return fail(`sourceUrl returned HTTP ${response.status} without a redirect target.`);
      }
      try {
        target = new URL(location, validated.url).toString();
      } catch {
        return fail("sourceUrl redirected to an invalid URL.");
      }
      continue;
    }

    if (!response.ok) {
      await discardBody(response);
      return fail(`sourceUrl returned HTTP ${response.status}.`);
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      await discardBody(response);
      return fail(`sourceUrl is not an image; the server returned content-type "${mimeType || "none"}".`);
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await discardBody(response);
      return fail(`the image at sourceUrl is larger than the ${formatBytes(maxBytes)} limit.`);
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await readCappedBody(response, maxBytes);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return fail(`could not read the image from sourceUrl (${reason}).`);
    }
    if (bytes === null) {
      return fail(`the image at sourceUrl is larger than the ${formatBytes(maxBytes)} limit.`);
    }
    if (bytes.byteLength === 0) {
      return fail("sourceUrl returned an empty response.");
    }

    return {
      ok: true,
      image: { bytes, mimeType, finalUrl: validated.url.toString() },
    };
  }

  return fail(`sourceUrl redirected more than ${maxRedirects} times without returning an image.`);
}

export type CreatedAsset = {
  id?: string;
  name?: string;
  url?: string;
  thumbnailUrl?: string;
  size?: string | number | null;
  width?: string | number | null;
  height?: string | number | null;
  format?: string | null;
  folderId?: string | null;
  error?: string;
};

export type UploadImageInput = {
  dataUrl?: unknown;
  sourceUrl?: unknown;
  name?: unknown;
  folderId?: unknown;
  alt?: unknown;
};

export type UploadImageDeps = {
  createAsset: (payload: Record<string, unknown>) => Promise<CreatedAsset>;
  getFallbackLang: () => Promise<string>;
  formatError?: (err: unknown) => string;
  onMeta?: (detail: Record<string, unknown>) => void;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function nameFromUrl(sourceUrl: string): string {
  if (!sourceUrl) return "";
  try {
    const last = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 200) : "";
  } catch {
    return "";
  }
}

const dimensionsOf = (asset: CreatedAsset): string => {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
  return `${width}×${height}`;
};

const imgDimAttrs = (asset: CreatedAsset): string => {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "";
  return ` width="${width}" height="${height}"`;
};

const sizeOf = (asset: CreatedAsset): string => {
  const size = Number(asset.size);
  if (!Number.isFinite(size) || size <= 0) return "";
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
};

function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.slice(0, 253);
  } catch {
    return "invalid";
  }
}

/**
 * Shared media-library upload implementation for both Builder AI and MCP `upload_image`.
 */
export async function executeUploadImage(
  args: UploadImageInput,
  deps: UploadImageDeps,
): Promise<{ ok: true; text: string; asset: CreatedAsset } | { ok: false; message: string }> {
  const dataUrl = asText(args.dataUrl);
  const sourceUrl = asText(args.sourceUrl);

  if (dataUrl && sourceUrl) {
    return { ok: false, message: "Error: pass either dataUrl or sourceUrl, not both." };
  }
  if (!dataUrl && !sourceUrl) {
    return { ok: false, message: "Error: pass one of dataUrl (base64 data URL) or sourceUrl (public http(s) image URL)." };
  }

  const requestedName = asText(args.name);
  const folderId = asText(args.folderId) || undefined;
  const alt = asText(args.alt);

  deps.onMeta?.({
    source: dataUrl ? "dataUrl" : "sourceUrl",
    ...(sourceUrl ? { sourceHost: hostOf(sourceUrl) } : {}),
    ...(folderId ? { folderId } : {}),
  });

  const source: ImageSourceResult = dataUrl ? parseImageDataUrl(dataUrl) : await fetchRemoteImage(sourceUrl);
  if (!source.ok) return { ok: false, message: source.message };

  const { bytes, mimeType } = source.image;
  const ext = extensionForMime(mimeType);
  if (!ext) {
    return { ok: false, message: `Error: "${mimeType}" is not a supported image type. Use jpg, png, webp, gif, svg or tiff.` };
  }
  const fileName = withExtension(requestedName || nameFromUrl(sourceUrl) || "image", ext);

  deps.onMeta?.({ bytes: bytes.byteLength, mimeType, fileName });

  let descriptionLang = "en";
  if (alt) {
    try {
      descriptionLang = (await deps.getFallbackLang()) || "en";
    } catch {
      // A missing settings row must not cost the upload its description.
    }
  }

  let asset: CreatedAsset;
  try {
    asset = await deps.createAsset({
      name: fileName,
      file: bytes,
      folderId: folderId ?? null,
      mimeType,
      ...(alt ? { description: { [descriptionLang]: alt } } : {}),
    });
  } catch (err) {
    const message = deps.formatError ? deps.formatError(err) : err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Error: Failed to upload the image. ${message}` };
  }

  if (!asset || asset.error) {
    return {
      ok: false,
      message: `Error: Failed to upload the image. ${asset?.error ?? "the media library returned no asset"}`,
    };
  }
  if (!asset.url) {
    return { ok: false, message: "Error: the image was stored but the media library returned no URL." };
  }

  deps.onMeta?.({ assetId: asset.id, assetUrl: asset.url });

  const dimensions = dimensionsOf(asset);
  const size = sizeOf(asset);
  const details = [
    dimensions ? `- Dimensions: ${dimensions} px` : "",
    size ? `- Size: ${size} (${asset.format ?? ext})` : "",
    folderId ? `- Folder: ${folderId}` : "",
    alt ? `- Description (${descriptionLang}): ${alt}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const dimAttrs = imgDimAttrs(asset);
  const text = `### Image "${asset.name ?? fileName}" uploaded to the media library
- URL: ${asset.url}
${details}
- *Asset ID: ${asset.id ?? "unknown"}*
- Place it with edit_block or add_blocks as an <img>. Keep the width and height so it renders at its natural size — a bare <img> with no dimensions becomes a full-bleed block that collapses to zero height when it is alone on a page. Example: <img src="${asset.url}" alt="${alt || "describe the image"}"${dimAttrs}>. For a specific size, crop, or responsive layout, set your own width/height (or wrap it in a sized container) instead. The image is not on any page until you make that edit.`;

  return { ok: true, text, asset };
}
