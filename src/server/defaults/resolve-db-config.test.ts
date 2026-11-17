import { describe, expect, it } from "vitest";
import { resolveChaiDbConfig } from "./resolve-db-config";
import { stubChaiDbSetup } from "~/tests/setup/stub-chai-db";
import type { ChaiDbSetup } from "~/db/core";

describe("resolveDbConfig", () => {
  it("throws when input is undefined", () => {
    expect(() => resolveChaiDbConfig(undefined)).toThrow(/`db` is required/);
  });

  it("throws when drizzle is missing", () => {
    expect(() => resolveChaiDbConfig({ schema: {} } as ChaiDbSetup)).toThrow(/`db` is required/);
  });

  it("returns a valid ChaiDbSetup", () => {
    const setup = stubChaiDbSetup();
    expect(resolveChaiDbConfig(setup)).toBe(setup);
  });
});
