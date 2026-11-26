import { getConfigFeatures } from "~/server/defaults/config-registry";
import type { ChaiDesignChecksMode, ChaiDesignSystemFeature } from "~/types/design-system";
import type { ResolvedChaiBuilderServerConfig } from "~/types/server-config";

/**
 * The deployment switch for the design-system tools across MCP and Builder AI.
 *
 * `true` turns it on with warning-level design checks; `{ designChecks: "strict" }` makes
 * error findings reject a block write; `"off"` keeps the tools without write-time checks.
 * Omitted or false: nothing is registered and every existing flow is unchanged.
 * @internal
 */
export type ChaiDesignSystemOption = boolean | { designChecks?: ChaiDesignChecksMode };

export const DESIGN_SYSTEM_OFF: ChaiDesignSystemFeature = { enabled: false, designChecks: "off" };

/** The feature value to store, or null when the option leaves the feature off (no key is set). */
export function resolveDesignSystemFeature(option: ChaiDesignSystemOption | undefined): ChaiDesignSystemFeature | null {
  if (!option) return null;
  if (option === true) return { enabled: true, designChecks: "warn" };
  return { enabled: true, designChecks: option.designChecks ?? "warn" };
}

/** The switch at request time. @internal */
export function getDesignSystemFeature(): ChaiDesignSystemFeature {
  return getConfigFeatures().designSystem ?? DESIGN_SYSTEM_OFF;
}

export const isDesignSystemFeatureOn = (config: Readonly<ResolvedChaiBuilderServerConfig>): boolean =>
  config.features?.designSystem?.enabled === true;
