import type { ChaiPageTypeEntry } from "~/types/chaibuilder-config";

const PAGE_ICON = `<svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M5 8V20H19V8H5ZM5 6H19V4H5V6ZM20 22H4C3.44772 22 3 21.5523 3 21V3C3 2.44772 3.44772 2 4 2H20C20.5523 2 21 2.44772 21 3V21C21 21.5523 20.5523 22 20 22ZM7 10H11V14H7V10ZM7 16H17V18H7V16ZM13 11H17V13H13V11Z"></path></svg>`;

const GLOBAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hash-icon lucide-hash"><line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/></svg>`;

export const BUILTIN_PAGE_TYPE: ChaiPageTypeEntry = {
  key: "page",
  name: "Static Page",
  icon: PAGE_ICON,
  hasSlug: true,
};

export const BUILTIN_GLOBAL_PARTIAL_TYPE: ChaiPageTypeEntry = {
  key: "global",
  name: "Global Block",
  pluralName: "Global Blocks",
  helpText: "A global block can be reused in multiple pages.",
  icon: GLOBAL_ICON,
  partial: true,
  hasSlug: false,
};

const FOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;

// A folder only claims a URL segment for its children — it has no content and
// never renders (direct visits 404). It can later be converted to a page.
export const BUILTIN_FOLDER_TYPE: ChaiPageTypeEntry = {
  key: "_folder",
  name: "Folder",
  helpText: "A folder groups pages under a URL segment. It has no content of its own.",
  icon: FOLDER_ICON,
  hasSlug: true,
};

export const BUILTIN_PAGE_TYPES: ChaiPageTypeEntry[] = [
  BUILTIN_PAGE_TYPE,
  BUILTIN_GLOBAL_PARTIAL_TYPE,
  BUILTIN_FOLDER_TYPE,
];
