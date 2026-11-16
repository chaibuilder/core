import { ChaiTheme, ChaiThemeOptions } from "~/types/chaibuilder-editor-props";

/**
 * The editor's own default theme (color-picker/config-panel seed values) — one of three
 * divergent default-theme constants in this repo, each with its own callers and slightly
 * different values. The other two: `DEFAULT_APP_THEME` (drizzle/seed/defaults.ts, new-site/snapshot
 * fallback) and `GetWebsiteSettingsAction.getDefaultSettings()`
 * (chai/src/server/chai-actions/website/get-website-settings.ts, the editor read action's
 * fallback).
 */
export const defaultThemeOptions: ChaiThemeOptions = {
  fontFamily: {
    "font-heading": "Arial",
    "font-body": "Arial",
  },
  borderRadius: "10px",
  colors: [
    {
      group: "Body",
      items: {
        background: ["#FFFFFF", "#121212"],
        foreground: ["#121212", "#FFFFFF"],
      },
    },
    {
      group: "Primary",
      items: {
        primary: ["#2563EB", "#3B82F6"],
        "primary-foreground": ["#FFFFFF", "#FFFFFF"],
      },
    },
    {
      group: "Secondary",
      items: {
        secondary: ["#F3F4F6", "#374151"],
        "secondary-foreground": ["#1F2937", "#F9FAFB"],
      },
    },
    {
      group: "Border, Input & Ring",
      items: {
        border: ["#E5E7EB", "#374151"],
        input: ["#E5E7EB", "#374151"],
        ring: ["#2563EB", "#3B82F6"],
      },
    },
    {
      group: "Card",
      items: {
        card: ["#FFFFFF", "#1F2937"],
        "card-foreground": ["#121212", "#FFFFFF"],
      },
    },
    {
      group: "Popover",
      items: {
        popover: ["#FFFFFF", "#1F2937"],
        "popover-foreground": ["#121212", "#FFFFFF"],
      },
    },
    {
      group: "Muted",
      items: {
        muted: ["#F3F4F6", "#374151"],
        "muted-foreground": ["#6B7280", "#9CA3AF"],
      },
    },
    {
      group: "Accent",
      items: {
        accent: ["#F3F4F6", "#374151"],
        "accent-foreground": ["#1F2937", "#FFFFFF"],
      },
    },
    {
      group: "Destructive",
      items: {
        destructive: ["#DC2626", "#EF4444"],
        "destructive-foreground": ["#FFFFFF", "#FFFFFF"],
      },
    },
  ],
};

export const defaultThemeValues: ChaiTheme = {
  fontFamily: {
    heading: "Arial",
    body: "Arial",
  },
  borderRadius: "0.5rem",
  colors: {
    background: ["#FFFFFF", "#242424"],
    foreground: ["#0A0A0B", "#FAFAFA"],
    primary: ["#155DFC", "#155DFC"],
    "primary-foreground": ["#FAFAFA", "#FFFFFF"],
    secondary: ["#F4F4F5", "#202020"],
    "secondary-foreground": ["#18181B", "#FAFAFA"],
    muted: ["#F4F4F5", "#929292"],
    "muted-foreground": ["#71717A", "#A3A3A3"],
    accent: ["#F4F4F5", "#333333"],
    "accent-foreground": ["#18181B", "#FAFAFA"],
    destructive: ["#EF4444", "#8c3434"],
    "destructive-foreground": ["#FAFAFA", "#FAFAFA"],
    border: ["#E4E4E7", "#333333"],
    input: ["#E4E4E7", "#333333"],
    ring: ["#18181B", "#1E90FF"],
    card: ["#FFFFFF", "#242424"],
    "card-foreground": ["#0A0A0B", "#FAFAFA"],
    popover: ["#FFFFFF", "#242424"],
    "popover-foreground": ["#0A0A0B", "#FAFAFA"],
  },
};
