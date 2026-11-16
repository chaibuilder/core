import { get } from "lodash-es";
import type { ReactNode } from "react";
import { consola } from "consola";
import { draftMode } from "next/headers";
import { CHAI_BUILT_IN_DESIGN_TOKENS } from "~/constants/BUILTIN_TOKENS";
import { getFontStyles } from "~/registry";
import { getChaiThemeCssVariables } from "~/builder/core/components/canvas/static/chai-theme-helpers";
import { getChaiBuilder } from "~/server/get-chaibuilder";
import { getActiveChaiBuilderConfig } from "~/server/defaults/config-registry";
import { getLayoutIdByName } from "~/server/chai-builder/public/get-layout-id-by-name";
import { ChaiDesignTokens, ChaiTheme } from "~/types";
import { applyDesignTokens } from "~/utils";
import { NextJSRenderChaiBlocks } from "./next-render-chai-blocks";

export type WithChaiLayoutProps = {
  /** Layout page uuid — collision-proof escape hatch when multiple layouts share a name. */
  id?: string;
  /** Layout page display name (resolved via getLayoutIdByName). */
  name?: string;
  /** Optional language segment for `/_partial/<lang>/<id>` slug. */
  lang?: string;
  /**
   * Default slot content — injects into the first unnamed PageSlot (`slotName` empty).
   * Optional when only named `slots` are used.
   */
  children?: ReactNode;
  /**
   * Named slot content. Keys must match PageSlot `slotName` values in the layout.
   *
   * @example
   * ```tsx
   * <WithChaiLayout
   *   name="Main Layout"
   *   slots={{ sidebar: <Sidebar />, promo: <PromoBanner /> }}
   * >
   *   <MainContent />
   * </WithChaiLayout>
   * ```
   */
  slots?: Record<string, ReactNode>;
};

function bareFallback(props: WithChaiLayoutProps): ReactNode {
  if (props.children != null) return props.children;
  if (props.slots) {
    const values = Object.values(props.slots).filter((node) => node != null);
    if (values.length === 1) return values[0];
    if (values.length > 1) return <>{values}</>;
  }
  return null;
}

/**
 * Wrap custom-coded route content in a builder-managed `_layout` page.
 *
 * - `children` → default (unnamed) PageSlot
 * - `slots={{ name: <Node /> }}` → PageSlots with matching `slotName`
 *
 * Missing/unpublished layouts fall back to bare children (or named slot values) + warn.
 */
export const WithChaiLayout = async (props: WithChaiLayoutProps) => {
  const cb = await getChaiBuilder(getActiveChaiBuilderConfig());
  return cb.runPageRequest(async () => {
    const withPhase = cb.withRenderPhase;

    const { isEnabled: draft } = await withPhase("WithChaiLayout.draftMode", () => draftMode());

    const layoutId =
      props.id ?? (props.name ? await withPhase("WithChaiLayout.getLayoutIdByName", () => getLayoutIdByName(props.name!)) : null);

    if (!layoutId) {
      consola.warn(
        `[WithChaiLayout] Layout not found (id=${props.id ?? "—"}, name=${props.name ?? "—"}); rendering content bare.`,
      );
      return bareFallback(props);
    }

    let payload: Awaited<ReturnType<typeof cb.getPagePayload>>;
    try {
      const slug = props.lang ? `/_partial/${props.lang}/${layoutId}` : `/_partial/${layoutId}`;
      payload = await withPhase("WithChaiLayout.getPagePayload", () => cb.getPagePayload(slug), `slug=${slug}`);
    } catch {
      consola.warn(
        `[WithChaiLayout] Failed to load layout ${layoutId} (unpublished or missing); rendering content bare.`,
      );
      return bareFallback(props);
    }

    const { page, settings, pageData, pageProps } = payload;
    const theme = get(settings, "theme", {}) as ChaiTheme;
    const tokens = {
      ...CHAI_BUILT_IN_DESIGN_TOKENS,
      ...(get(settings, "designTokens", {}) as ChaiDesignTokens),
    };

    const styles = await withPhase("WithChaiLayout.getPageStyles", () =>
      cb.getPageStyles(page.id, applyDesignTokens(page.blocks ?? [], tokens)),
    );
    const themeVars = await withPhase("WithChaiLayout.themeVariables", async () =>
      getChaiThemeCssVariables({ theme }),
    );
    const bodyFont = get(theme, "fontFamily.body", "Arial");
    const headingFont = get(theme, "fontFamily.heading", "Arial");
    const { fontStyles, preloads } = await withPhase("WithChaiLayout.getFontStyles", () =>
      getFontStyles(headingFont, bodyFont),
    );

    return (
      <>
        {preloads.length > 0 &&
          preloads.map((preload: string) => (
            <link key={preload} rel="preload" href={preload} as="font" type="font/woff2" crossOrigin="anonymous" />
          ))}
        <style href="chai-theme-vars" precedence="chai-theme">
          {themeVars}
        </style>
        {fontStyles ? (
          <style href="chai-fonts" precedence="chai-fonts">
            {fontStyles}
          </style>
        ) : null}
        {styles ? (
          <style href={`chai-layout-${page.id}`} precedence="chai-page">
            {styles}
          </style>
        ) : null}
        <NextJSRenderChaiBlocks
          pageData={pageData}
          settings={settings}
          page={page}
          pageProps={pageProps}
          withRenderPhase={withPhase}
          slot={props.children}
          slots={props.slots}
          draft={draft}
        />
      </>
    );
  });
};
