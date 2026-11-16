import { CHAI_VERSION, IS_CHAI_BUNDLED } from "~/constants/VERSION";
import { CHAI_EDITION_LABEL } from "~/edition/identity";

/**
 * Kept on `window` rather than in module scope so the banner stays a once-per-page
 * event even when the module graph is re-evaluated — HMR in dev, or two copies of
 * the package ending up in the same bundle.
 */
const BANNER_FLAG = "__chaiVersionBannerPrinted__";

const DOCS_URL = "https://www.chaibuilder.com/docs";
const HOME_URL = "https://chaibuilder.com";

/** The `background` shorthand is repeated so browsers that drop the gradient keep a solid fill. */
const BADGE_STYLE = [
  "background:#4f46e5",
  "background:linear-gradient(90deg,#6366f1,#a855f7)",
  "color:#ffffff",
  "font-weight:700",
  "font-size:12px",
  "letter-spacing:0.08em",
  "padding:6px 10px",
  "border-radius:6px 0 0 6px",
].join(";");

const VERSION_STYLE = [
  "background:#111827",
  "color:#e5e7eb",
  "font-weight:600",
  "font-size:12px",
  "padding:6px 10px",
  "border-radius:0 6px 6px 0",
].join(";");

const HEADING_STYLE = "color:#a855f7;font-weight:600;font-size:12px";
const BODY_STYLE = "color:#9ca3af;font-weight:400;font-size:12px;line-height:1.6";
const WARNING_STYLE = "color:#f59e0b;font-weight:600;font-size:12px";
const LINK_STYLE = "color:#60a5fa;font-weight:400;font-size:12px";

/** Brand-neutral part of the banner: printed for white-label hosts too. */
const WARNING_FORMAT =
  `%c👋 Not a developer? You've opened the browser console.%c\n` +
  `   It's a tool for engineers. Nothing is broken, and you can close it safely —\n` +
  `   just press Escape or click the ✕ on this panel.\n\n` +
  `%c⚠️  Never paste code in here.%c\n` +
  `   If anyone asked you to copy something into this box, it is a scam. Pasting it\n` +
  `   can hand them your account and your website. Close this and tell your team.\n`;
const WARNING_STYLES = [HEADING_STYLE, BODY_STYLE, WARNING_STYLE, BODY_STYLE];

/**
 * Prints the console banner, exactly once per page load.
 *
 * Two audiences share this console: developers, who want to know which version of the
 * package is actually running before they report anything, and everyone else, who opened
 * DevTools by accident or because someone told them to. The second group gets plain
 * language and the standard self-XSS warning — a console is the usual place people are
 * talked into pasting an attacker's script.
 *
 * `branded` (the `chaiBranding` feature) adds the ChaiBuilder badge with the edition label and
 * version, and the docs links. Without it only the neutral warning prints, so a white-label
 * host shows no ChaiBuilder name.
 *
 * Safe to call from anywhere; it no-ops on the server and on repeat calls.
 */
export const logChaiVersionBanner = (branded: boolean): void => {
  if (typeof window === "undefined") return;

  type BannerFlag = typeof BANNER_FLAG;
  type BannerWindow = Window & { [K in BannerFlag]?: boolean };
  const flagged = window as BannerWindow;
  if (flagged[BANNER_FLAG]) return;
  flagged[BANNER_FLAG] = true;

  if (!branded) {
    console.log(WARNING_FORMAT, ...WARNING_STYLES);
    return;
  }

  const version = IS_CHAI_BUNDLED ? `v${CHAI_VERSION}` : `${CHAI_VERSION} (source)`;

  console.log(
    `%c ☕ CHAIBUILDER ${CHAI_EDITION_LABEL} %c ${version} %c\n\n` +
      WARNING_FORMAT +
      `\n%c🛠  Building with ChaiBuilder?%c\n` +
      `   Docs  %c${DOCS_URL}%c\n` +
      `   Home  %c${HOME_URL}%c\n`,
    BADGE_STYLE,
    VERSION_STYLE,
    "",
    ...WARNING_STYLES,
    HEADING_STYLE,
    BODY_STYLE,
    LINK_STYLE,
    BODY_STYLE,
    LINK_STYLE,
    BODY_STYLE,
  );
};
