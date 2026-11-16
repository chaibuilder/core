/**
 * Argument summarizing for the audit hook.
 *
 * A tool call's arguments are the most useful thing in an audit trail and the most
 * dangerous thing to store verbatim: `add_blocks` carries whole pages of HTML, and a
 * host tool may take a token. Long values are truncated and keys that look like secrets
 * are replaced, so a host can log the result without reviewing every tool's schema.
 */

const MAX_VALUE_LENGTH = 512;
const SECRET_KEY_PATTERN = /(pass|secret|token|apikey|api_key|credential|authorization|cookie)/i;
const REDACTED = "[redacted]";

function summarizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}… (${value.length} chars)` : value;
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map(summarizeValue);
    return value.length > 20 ? [...head, `… (${value.length} items)`] : head;
  }
  if (value && typeof value === "object") {
    return summarizeChaiMcpToolArgs(value as Record<string, unknown>);
  }
  return value;
}

export function summarizeChaiMcpToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : summarizeValue(value);
  }
  return out;
}
