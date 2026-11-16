export const LAYOUT_TOKEN_IDS = ["dt#layout-fluid", "dt#layout-container", "dt#layout-narrow", "dt#layout-bleed"];

// A block holds one layout token: adding one drops any other.
export const dropReplacedLayoutTokens = (classes: string, newClasses: string[]) =>
  newClasses.some((cls) => LAYOUT_TOKEN_IDS.includes(cls))
    ? classes
        .split(" ")
        .filter((cls) => !LAYOUT_TOKEN_IDS.includes(cls))
        .join(" ")
    : classes;
