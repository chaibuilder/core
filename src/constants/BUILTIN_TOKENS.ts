import { cn } from "~/lib/utils";
import { ChaiDesignTokens } from "~/types/types";

export const CHAI_BUILT_IN_DESIGN_TOKENS: ChaiDesignTokens = {
  "dt#btn": {
    name: "Button",
    description: "Base button styles",
    value: cn(
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      "h-9 px-4 py-2",
    ),
  },
  "dt#btn-primary": {
    name: "Button-Primary",
    description: "Primary button style",
    value: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  },
  "dt#btn-destructive": {
    name: "Button-Destructive",
    description: "Destructive button style",
    value: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
  },
  "dt#btn-outline": {
    name: "Button-Outline",
    description: "Outline button style",
    value: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  },
  "dt#btn-secondary": {
    name: "Button-Secondary",
    description: "Secondary button style",
    value: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  },
  "dt#btn-ghost": {
    name: "Button-Ghost",
    description: "Ghost button style",
    value: "hover:bg-accent hover:text-accent-foreground",
  },
  "dt#btn-link": {
    name: "Button-Link",
    description: "Link button style",
    value: "text-primary underline-offset-4 hover:underline",
  },
  "dt#btn-icon": {
    name: "Button-Icon",
    description: "Icon button style",
    value: "h-9 w-9",
  },
  "dt#btn-sm": {
    name: "Button-Small",
    description: "Small button style",
    value: "h-8 rounded-md px-3 text-xs",
  },
  "dt#btn-lg": {
    name: "Button-Large",
    description: "Large button style",
    value: "h-10 rounded-md px-8",
  },

  // Input Tokens
  "dt#input": {
    name: "Input",
    description: "Base input field style",
    value:
      "flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  },
  "dt#input-sm": {
    name: "Input-Small",
    description: "Small input field style",
    value: "h-7 text-xs",
  },
  "dt#input-lg": {
    name: "Input-Large",
    description: "Large input field style",
    value: "h-10 text-sm",
  },

  // Textarea Tokens
  "dt#textarea": {
    name: "Textarea",
    description: "Base textarea style",
    value:
      "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs text-foreground shadow-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  },
  "dt#textarea-sm": {
    name: "Textarea-Small",
    description: "Small textarea style",
    value: "min-h-[40px] text-xs",
  },
  "dt#textarea-lg": {
    name: "Textarea-Large",
    description: "Large textarea style",
    value: "min-h-[80px] text-sm",
  },

  // Badge Tokens
  "dt#badge": {
    name: "Badge",
    description: "Base badge style",
    value: cn(
      "inline-flex leading-tight items-center gap-1 text-[11px] cursor-pointer rounded-md border px-2.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    ),
  },
  "dt#badge-secondary": {
    name: "Badge-Secondary",
    description: "Secondary badge style",
    value: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  },
  "dt#badge-destructive": {
    name: "Badge-Destructive",
    description: "Destructive badge style",
    value: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
  },
  "dt#badge-outline": {
    name: "Badge-Outline",
    description: "Outline badge style",
    value: "text-foreground",
  },
  "dt#badge-active": {
    name: "Badge-Active",
    description: "Active badge style",
    value: "text-primary-foreground border-primary bg-primary px-2 py-px font-light",
  },
  "dt#badge-inactive": {
    name: "Badge-Inactive",
    description: "Inactive badge style",
    value: "text-foreground border-border bg-secondary hover:bg-accent px-2 py-px font-light",
  },

  // Alert Tokens
  "dt#alert": {
    name: "Alert",
    description: "Base alert style",
    value: cn(
      "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
      "bg-surface text-foreground",
    ),
  },
  "dt#alert-destructive": {
    name: "Alert-Destructive",
    description: "Destructive alert style",
    value: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
  },
  "dt#alert-title": {
    name: "Alert-Title",
    description: "Alert title style",
    value: "mb-1 font-medium leading-none tracking-tight",
  },
  "dt#alert-description": {
    name: "Alert-Description",
    description: "Alert description style",
    value: "text-sm [&_p]:leading-relaxed",
  },

  // Card Tokens
  "dt#card": {
    name: "Card",
    description: "Base card style",
    value: "rounded-xl border bg-card text-card-foreground shadow",
  },
  "dt#card-header": {
    name: "Card-Header",
    description: "Card header style",
    value: "flex flex-col space-y-1.5 p-6",
  },
  "dt#card-title": {
    name: "Card-Title",
    description: "Card title style",
    value: "font-semibold leading-none tracking-tight",
  },
  "dt#card-description": {
    name: "Card-Description",
    description: "Card description style",
    value: "text-sm text-muted-foreground",
  },
  "dt#card-content": {
    name: "Card-Content",
    description: "Card content style",
    value: "p-6 pt-0",
  },
  "dt#card-footer": {
    name: "Card-Footer",
    description: "Card footer style",
    value: "flex items-center p-6 pt-0",
  },

  // Toggle Tokens
  "dt#toggle": {
    name: "Toggle",
    description: "Base toggle style",
    value: cn(
      "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      "bg-transparent h-9 px-2 min-w-9",
    ),
  },
  "dt#toggle-outline": {
    name: "Toggle-Outline",
    description: "Outline toggle style",
    value: "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground",
  },
  "dt#toggle-sm": {
    name: "Toggle-Small",
    description: "Small toggle style",
    value: "h-8 px-1.5 min-w-8",
  },
  "dt#toggle-lg": {
    name: "Toggle-Large",
    description: "Large toggle style",
    value: "h-10 px-2.5 min-w-10",
  },

  // Label Tokens
  "dt#label": {
    name: "Label",
    description: "Form label style",
    value:
      "text-xs font-light leading-none text-foreground/80 dark:text-foreground/60 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  },

  // Checkbox Tokens
  "dt#checkbox": {
    name: "Checkbox",
    description: "Checkbox style",
    value:
      "peer h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-border hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
  },

  // Switch Tokens
  "dt#switch": {
    name: "Switch",
    description: "Switch toggle style",
    value:
      "peer inline-flex h-4 w-[25px] cursor-pointer items-center rounded-full bg-muted transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary dark:data-[state=unchecked]:bg-background",
  },
  "dt#switch-thumb": {
    name: "Switch-Thumb",
    description: "Switch thumb style",
    value:
      "pointer-events-none block h-3 w-3 rounded-full bg-secondary shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0.5",
  },

  // Skeleton Tokens
  "dt#skeleton": {
    name: "Skeleton",
    description: "Loading skeleton style",
    value: "animate-pulse rounded-md bg-primary/10",
  },

  // Separator Tokens
  "dt#separator": {
    name: "Separator",
    description: "Horizontal separator style",
    value: "shrink-0 bg-border h-[1px] w-full",
  },
  "dt#separator-vertical": {
    name: "Separator-Vertical",
    description: "Vertical separator style",
    value: "shrink-0 bg-border h-full w-[1px]",
  },

  // Progress Tokens
  "dt#progress": {
    name: "Progress",
    description: "Progress bar container style",
    value: "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
  },
  "dt#progress-indicator": {
    name: "Progress-Indicator",
    description: "Progress bar indicator style",
    value: "h-full bg-primary transition-all duration-300",
  },

  // Layout Tokens
  "dt#content-gutter-x": {
    name: "Content-Gutter-X",
    description: "Side padding for content inside a section",
    value: "px-4 sm:px-8",
  },
  "dt#content-gutter-y": {
    name: "Content-Gutter-Y",
    description: "Vertical padding for content inside a section",
    value: "py-8 sm:py-12 md:py-16 lg:py-20",
  },
  "dt#layout-fluid": {
    name: "Layout-Fluid",
    description: "Full width with side gutter",
    value: "mx-auto w-full max-w-none dt#content-gutter-x",
  },
  "dt#layout-container": {
    name: "Layout-Container",
    description: "Centred, max 1280px",
    value: "mx-auto w-full max-w-[1280px] dt#content-gutter-x",
  },
  "dt#layout-narrow": {
    name: "Layout-Narrow",
    description: "Centred reading column, max 768px",
    value: "mx-auto w-full max-w-[768px] dt#content-gutter-x",
  },
  "dt#layout-bleed": {
    name: "Layout-Bleed",
    description: "Full width, no side gutter",
    value: "mx-auto w-full max-w-none px-0",
  },
  "dt#site-content-width": {
    name: "Site-Content-Width",
    description: "Centred content width that follows the site layout",
    value: "mx-auto w-full max-w-[var(--site-content-width,1280px)]",
  },
};
