import { createHash } from "crypto";
import { pick } from "lodash-es";
import { z } from "zod";
import { getAppRow } from "~/server/chai-actions/apps/app-store";
import { ChaiBaseAction } from "~/server/chai-actions/base-action";
import { apiError } from "~/server/chai-actions/lib";
import { getConfigSiteSettingsTransform } from "~/server/defaults/config-registry";

export type GetWebsiteSettingsActionData = {
  draft: boolean;
};

type GetWebsiteSettingsActionResponse = {
  fallbackLang: string;
  languages: string[]; // Making it more flexible to match database schema
  theme: any; // Making it more flexible to match database schema
  appKey: string;
  designTokens?: any;
  appChanges?: string[];
  consentConfig?: Record<string, any>;
  configData?: Record<string, any>;
};

/** The row fields the editor receives; anything else on the row stays server-side. */
const SETTINGS_FIELDS = [
  "theme",
  "fallbackLang",
  "languages",
  "settings",
  "designTokens",
  "changes",
  "consentConfig",
  "configData",
];

export class GetWebsiteSettingsAction extends ChaiBaseAction<
  GetWebsiteSettingsActionData,
  GetWebsiteSettingsActionResponse
> {
  protected getValidationSchema() {
    return z.object({
      draft: z.boolean(),
    });
  }

  async execute(data: GetWebsiteSettingsActionData): Promise<GetWebsiteSettingsActionResponse> {
    if (!this.context) {
      throw apiError("CONTEXT_NOT_SET", new Error("CONTEXT_NOT_SET"));
    }

    const { appId } = this.context;
    const { draft } = data;

    // Use the appropriate table based on draft flag. The whole row, like the public read, so the
    // app's transform can derive settings from columns the core does not know.
    const { data: appRow, error } = await getAppRow(appId, { draft });

    if (error) {
      throw apiError("ERROR_PROJECT_CONFIG", error);
    }

    if (!appRow) {
      throw apiError("PROJECT_NOT_FOUND", new Error("Project not found"));
    }

    // Same hook the public read runs, so the editor shows the theme the site renders.
    const transform = getConfigSiteSettingsTransform();
    const transformed = transform ? await transform(appRow, { appId, draftMode: draft }) : appRow;
    const row: Record<string, any> = pick(transformed, SETTINGS_FIELDS);

    const appChanges = (row?.changes ?? []) as string[];

    return {
      ...this.getDefaultSettings(),
      ...row,
      // Handle null/undefined values by providing defaults
      fallbackLang: row?.fallbackLang || this.getDefaultSettings().fallbackLang,
      languages: (row?.languages as string[]) || this.getDefaultSettings().languages,
      theme: row?.theme || this.getDefaultSettings().theme,
      // Generate deterministic app key like the original implementation
      appKey: this.generateDeterministicUuid(appId),
      appChanges,
    };
  }

  /**
   * This editor read action's own fallback theme — one of three divergent default-theme
   * constants in this repo, each with its own callers and slightly different values. The
   * other two: `DEFAULT_APP_THEME` (drizzle/seed/defaults.ts, new-site/snapshot fallback)
   * and `defaultThemeOptions`/`defaultThemeValues`
   * (chai/src/builder/hooks/default-theme-options.ts, the editor's own picker seed).
   */
  getDefaultSettings() {
    return {
      fallbackLang: "en",
      languages: [],
      theme: {
        colors: {
          card: ["#FFFFFF", "#09090B"],
          ring: ["#2563EB", "#3B82F6"],
          input: ["#E4E4E7", "#27272A"],
          muted: ["#F4F4F5", "#27272A"],
          accent: ["#F4F4F5", "#27272A"],
          border: ["#E4E4E7", "#27272A"],
          popover: ["#FFFFFF", "#09090B"],
          primary: ["#2563EB", "#3B82F6"],
          secondary: ["#F4F4F5", "#27272A"],
          background: ["#FFFFFF", "#09090B"],
          foreground: ["#09090B", "#FFFFFF"],
          destructive: ["#EF4444", "#7F1D1D"],
          "card-foreground": ["#09090B", "#FFFFFF"],
          "muted-foreground": ["#71717A", "#A1A1AA"],
          "accent-foreground": ["#09090B", "#FFFFFF"],
          "popover-foreground": ["#09090B", "#FFFFFF"],
          "primary-foreground": ["#FFFFFF", "#FFFFFF"],
          "secondary-foreground": ["#09090B", "#FFFFFF"],
          "destructive-foreground": ["#FFFFFF", "#FFFFFF"],
        },
        fontFamily: { body: "Roboto", heading: "Poppins" },
        borderRadius: "30px",
      },
      settings: {},
      designTokens: {},
      consentConfig: {},
      configData: {},
    };
  }

  private generateDeterministicUuid(seed: string): string {
    // Create a deterministic hash from the seed
    const hash = createHash("sha256").update(seed).digest("hex");

    // Format as UUID v4 structure: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuid = [
      hash.substring(0, 8),
      hash.substring(8, 12),
      "4" + hash.substring(13, 16), // Version 4
      ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // Variant bits
      hash.substring(20, 32),
    ].join("-");

    return uuid;
  }
}
