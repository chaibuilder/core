/**
 * The colour keys of a site theme (`ChaiTheme.colors`). Each is a `[light, dark]` hex pair and
 * becomes a Tailwind colour (`bg-primary`, `text-muted-foreground`, `border-border`…).
 */
export const CHAI_THEME_REQUIRED_COLOR_KEYS = [
  "background",
  "foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
] as const;

export const CHAI_THEME_OPTIONAL_COLOR_KEYS = [
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "purple",
  "purple-foreground",
  "orange",
  "orange-foreground",
  "aqua",
  "aqua-foreground",
] as const;

export const CHAI_THEME_COLOR_KEYS = [...CHAI_THEME_REQUIRED_COLOR_KEYS, ...CHAI_THEME_OPTIONAL_COLOR_KEYS] as const;
export type ChaiThemeColorKey = (typeof CHAI_THEME_COLOR_KEYS)[number];
