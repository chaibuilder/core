import { describe, expect, it } from "vitest";
import type { ChaiMcpToolMeta } from "~/types/mcp";
import { canInvokeChaiMcpTool, missingChaiMcpToolPermissions } from "./permissions";

const meta = (permissions: string[]): ChaiMcpToolMeta => ({
  name: "a_tool",
  kind: "read",
  description: "",
  inputSchema: {},
  permissions,
});

describe("canInvokeChaiMcpTool", () => {
  it("denies an unregistered tool instead of treating it as unrestricted", () => {
    expect(canInvokeChaiMcpTool(["*"], undefined)).toBe(false);
  });

  it("requires every declared permission, not just one", () => {
    expect(canInvokeChaiMcpTool(["pages:read"], meta(["pages:read", "pages:update"]))).toBe(false);
    expect(canInvokeChaiMcpTool(["pages:read", "pages:update"], meta(["pages:read", "pages:update"]))).toBe(true);
  });

  it("honours wildcards", () => {
    expect(canInvokeChaiMcpTool(["pages:*"], meta(["pages:read", "pages:update"]))).toBe(true);
    expect(canInvokeChaiMcpTool(["*"], meta(["pages:publish"]))).toBe(true);
    expect(canInvokeChaiMcpTool(["pages:*"], meta(["assets:create"]))).toBe(false);
  });

  it("treats an empty declaration as any authenticated caller", () => {
    expect(canInvokeChaiMcpTool([], meta([]))).toBe(true);
  });

  it("names what is missing", () => {
    expect(missingChaiMcpToolPermissions(["pages:read"], meta(["pages:read", "pages:publish"]))).toEqual([
      "pages:publish",
    ]);
  });
});
