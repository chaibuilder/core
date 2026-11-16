import { z } from "zod";
import { getAllRegisteredFonts } from "~/registry";
import { getAppFields, updateAppFields } from "~/server/chai-actions/apps/app-store";
import { addThemeSaveRevision } from "~/server/chai-actions/revisions/theme-revisions";
import type { ChaiTheme } from "~/types/chaibuilder-editor-props";
import { CONTRAST_LARGE, describeContrastIssue, themeContrastIssues } from "~/utils/design-checks";
import { ActionError } from "../action-error";
import { formatZodIssues } from "../ai/design-system-schema";
import { ChaiBaseAction } from "../base-action";
import { serializeByKey } from "../utils/serialize-by-key";
import { applyThemePatch, chaiThemePatchSchema, type ChaiThemePatch } from "./theme-patch";

type UpdateThemeActionData = { theme: ChaiThemePatch };
type UpdateThemeActionResponse = {
  success: true;
  theme: ChaiTheme;
  changed: string[];
  /** Pairs this change left below 4.5:1 but at 3:1 or more: readable as large text only. */
  weakContrast: string[];
};

/**
 * Patch the draft site theme: fonts, radius and colours, each merged into what is stored.
 * Like the builder's theme save it marks the theme as changed; `PUBLISH_CHANGES` with
 * `"THEME"` takes it live.
 *
 * Refuses a font the site has not registered (it has no font files: pages would fall back
 * to a system font while the theme names another) and a colour change that leaves a
 * surface/foreground pair it touches under 3:1.
 */
export class UpdateThemeAction extends ChaiBaseAction<UpdateThemeActionData, UpdateThemeActionResponse> {
  protected getValidationSchema() {
    return z.object({ theme: z.any() });
  }

  async execute(data: UpdateThemeActionData): Promise<UpdateThemeActionResponse> {
    if (!this.context) {
      throw new ActionError("Context not set", "CONTEXT_NOT_SET");
    }
    const parsed = chaiThemePatchSchema.safeParse(data.theme ?? {});
    if (!parsed.success) {
      throw new ActionError(`Invalid theme: ${formatZodIssues(parsed.error)}`, "INVALID_DATA", 400);
    }

    const fonts = getAllRegisteredFonts().map((font) => font.family);
    const unknownFonts = [parsed.data.fontFamily?.heading, parsed.data.fontFamily?.body].filter(
      (font): font is string => !!font && !fonts.includes(font),
    );
    if (unknownFonts.length) {
      throw new ActionError(
        `${unknownFonts.map((font) => `"${font}"`).join(" and ")} is not a font this site can use. Available: ${fonts.slice(0, 60).join(", ")}.`,
        "INVALID_DATA",
        400,
      );
    }

    const { appId } = this.context;
    // Read, patch and write as one step per app, so parallel edits do not drop each other.
    return serializeByKey(`apps:${appId}`, async () => {
      const { data: app, error: readError } = await getAppFields(appId, ["theme", "changes"]);
      if (readError) {
        throw new ActionError("Error reading the site theme", "ERROR_UPDATE_THEME", 500, readError);
      }
      if (!app) {
        throw new ActionError("Site not found", "NOT_FOUND", 404);
      }

      const { next, changed } = applyThemePatch(app.theme as Partial<ChaiTheme>, parsed.data);
      if (changed.length === 0) {
        return { success: true, theme: next, changed, weakContrast: [] };
      }

      // Only the pairs this change touches: a pre-existing weak pair is not this call's doing.
      const touched = new Set(changed.filter((key) => key.startsWith("colors.")).map((key) => key.slice(7)));
      const issues = themeContrastIssues(next.colors as Record<string, unknown>).filter(
        (issue) => touched.has(issue.surface) || touched.has(issue.text),
      );
      const unreadable = issues.filter((issue) => issue.ratio < CONTRAST_LARGE);
      if (unreadable.length) {
        throw new ActionError(
          `Not saved: this would make text unreadable. ${unreadable.map(describeContrastIssue).join("; ")}. Keep every surface/foreground pair at 4.5:1 or better.`,
          "INVALID_DATA",
          400,
        );
      }

      const changes = [...new Set([...((app.changes as string[] | null) ?? []), "THEME"])];
      const { error } = await updateAppFields(appId, { theme: next, changes });
      if (error) {
        throw new ActionError("Error updating the site theme", "ERROR_UPDATE_THEME", 500, error);
      }
      // Same history as builder saves, so an AI/MCP theme change can be rolled back.
      await addThemeSaveRevision(appId, this.context?.userId, { theme: next });
      const weakContrast = issues.filter((issue) => issue.ratio >= CONTRAST_LARGE).map(describeContrastIssue);
      return { success: true, theme: next, changed, weakContrast };
    });
  }
}
