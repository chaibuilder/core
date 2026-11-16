import { describe, expect, it } from "vitest";
import type { ChaiActionContext } from "~/types/chai-action";
import {
  BUILDER_EDIT_SOURCE,
  CLONE_EDIT_SOURCE,
  INTER_SITE_EDIT_SOURCE,
  MCP_EDIT_SOURCE,
  SETTINGS_EDIT_SOURCE,
  resolveEditSource,
} from "./edit-source";

const base: ChaiActionContext = { appId: "app-1", userId: "user-1" };

describe("resolveEditSource", () => {
  describe("without a stated surface (heuristic)", () => {
    it("labels a plain browser session as builder", () => {
      expect(resolveEditSource(base)).toBe(BUILDER_EDIT_SOURCE);
      expect(resolveEditSource({ ...base, userAccess: { role: "editor", permissions: ["pages:*"] } })).toBe(
        BUILDER_EDIT_SOURCE,
      );
    });

    it("labels the host's mcp role as mcp", () => {
      expect(resolveEditSource({ ...base, userAccess: { role: "mcp", permissions: ["pages:read"] } })).toBe(
        MCP_EDIT_SOURCE,
      );
    });

    it("labels any delegation ceiling as mcp", () => {
      expect(resolveEditSource({ ...base, delegatedPermissions: ["pages:read"] })).toBe(MCP_EDIT_SOURCE);
      expect(resolveEditSource({ ...base, delegatedPermissions: [] })).toBe(MCP_EDIT_SOURCE);
    });

    it("labels a missing context as builder", () => {
      expect(resolveEditSource(null)).toBe(BUILDER_EDIT_SOURCE);
      expect(resolveEditSource(undefined)).toBe(BUILDER_EDIT_SOURCE);
    });
  });

  describe("with a stated surface", () => {
    it("returns settings only when the context says so", () => {
      expect(resolveEditSource({ ...base, surface: "settings" })).toBe(SETTINGS_EDIT_SOURCE);
      // Same person, same session shape, no surface: still a builder edit.
      expect(resolveEditSource({ ...base, surface: null })).toBe(BUILDER_EDIT_SOURCE);
    });

    it("prefers the surface over the delegation heuristic for service contexts", () => {
      const service = {
        ...base,
        delegatedPermissions: ["assets:create"],
        userAccess: { role: "service", permissions: ["assets:create"] },
      };
      expect(resolveEditSource({ ...service, surface: "inter-site" })).toBe(INTER_SITE_EDIT_SOURCE);
      expect(resolveEditSource({ ...service, surface: "clone" })).toBe(CLONE_EDIT_SOURCE);
      // Without the surface the same context is mislabelled as an agent edit.
      expect(resolveEditSource(service)).toBe(MCP_EDIT_SOURCE);
    });

    it("prefers the surface over the mcp role label", () => {
      expect(resolveEditSource({ ...base, surface: "builder", userAccess: { role: "mcp", permissions: [] } })).toBe(
        BUILDER_EDIT_SOURCE,
      );
      expect(resolveEditSource({ ...base, surface: "mcp" })).toBe(MCP_EDIT_SOURCE);
    });
  });
});
