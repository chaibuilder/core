import type { ChaiClientPlugin } from "~/builder/register-apis/register-chai-plugin";
import type { ChaiServerPlugin } from "~/types/plugin";

/**
 * Contract for `src/edition/*` — the one directory that differs between the editions of
 * ChaiBuilder (`chaicore` and `chaipro`) by design and is never synced (see SYNC.md).
 *
 * Shared code reaches edition-specific facts only through these shapes, so both editions must
 * export the same names with the same types; each edition file ends in `satisfies` against
 * the matching type here.
 */
export type ChaiEditionIdentity = {
  /** npm package name, used in runtime error messages: `chaicore` or `chaipro`. */
  CHAI_PACKAGE_NAME: string;
  /** Short edition id. */
  CHAI_EDITION: "core" | "pro";
  /** Upper-case label for the console banner: `CORE` or `PRO`. */
  CHAI_EDITION_LABEL: string;
};

/** Server plugins that are always on for the edition; prepended by `buildChaiBuilderConfig`. */
export type ChaiEditionServerPlugins = {
  editionServerPlugins: () => ChaiServerPlugin[];
};

/** Client plugins that are always on for the edition; prepended by `registerChaiClientPlugins`. */
export type ChaiEditionClientPlugins = {
  editionClientPlugins: ChaiClientPlugin[];
};

/**
 * Every table the edition declares, plugin-owned included, keyed by JS export name (value: default
 * SQL name). `buildChaiBuilderConfig` accepts these as `tableMapping` keys.
 */
export type ChaiEditionTableNames = {
  EDITION_TABLE_NAMES: Readonly<Record<string, string>>;
};

/** What the shared test harness (src/tests/setup) takes from the edition. */
export type ChaiEditionTestHarness<TDb = unknown> = {
  /** Server plugins registered by the test harness's `withTestDB` / `useTestChaiConfig`. */
  editionTestServerPlugins: () => ChaiServerPlugin[];
  /**
   * @deprecated The in-memory harness wipes every table after each test and never calls this.
   * Kept optional so an edition copy that still exports it type-checks until it is removed there.
   */
  editionTestCleanup?: (db: TDb) => Promise<void>;
};
