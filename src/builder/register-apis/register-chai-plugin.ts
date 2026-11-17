/**
 * Client-side plugin registration. A client plugin bundles a feature's UI
 * registrations (slots, sidebar panels, feature flags, hooks, blocks) behind a
 * single named `register()` call, so a whole feature set can be installed with
 * one API. Registration is once-per-name: re-invocations (React strict mode,
 * multiple builder mounts) are ignored.
 */
// Edition-level always-on client plugins are prepended here rather than named by
// the host. Mirrors the server side, where buildChaiBuilderConfig prepends
// editionServerPlugins().
import { editionClientPlugins } from "~/edition/builtin-client-plugins";

export type ChaiClientPlugin = {
  /** Unique plugin id, e.g. `"chai:redirects"`. */
  name: string;
  /** Runs the plugin's register-api calls (registerChaiSlot, registerChaiSidebarPanel, ...). */
  register: () => void;
};

const REGISTERED_CLIENT_PLUGINS = new Set<string>();

export const registerChaiClientPlugins = (plugins: ChaiClientPlugin[] = []): void => {
  for (const plugin of [...editionClientPlugins, ...plugins]) {
    if (REGISTERED_CLIENT_PLUGINS.has(plugin.name)) {
      continue;
    }
    REGISTERED_CLIENT_PLUGINS.add(plugin.name);
    try {
      plugin.register();
    } catch (error) {
      console.error(`ChaiBuilder: client plugin "${plugin.name}" failed to register:`, error);
    }
  }
};

/** Registers one client plugin. Same as `registerChaiClientPlugins([plugin])`. */
export const registerChaiClientPlugin = (plugin: ChaiClientPlugin): void => {
  registerChaiClientPlugins([plugin]);
};

/** @internal Clears registered plugin names between unit tests. */
export const resetChaiClientPluginsForTests = (): void => {
  REGISTERED_CLIENT_PLUGINS.clear();
};
