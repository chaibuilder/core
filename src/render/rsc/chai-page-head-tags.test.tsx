import { renderToReadableStream } from "react-dom/server.browser";
import { describe, expect, it } from "vitest";
import { setChaiContextResolver } from "~/server/chai-context-resolver";
import { useTestChaiConfig } from "~/tests/setup/chai-config";
import { withRequestContext } from "~/tests/setup/request-context";
import { TEST_APP_ID } from "~/tests/setup/test-app";
import type { ChaiFullPage } from "~/types/pages";
import { ChaiPageCSS } from "./chai-page-head-tags";

const page = { id: "p1", blocks: [] } as unknown as ChaiFullPage;

const render = (theme: Record<string, unknown>) => {
  useTestChaiConfig({ transformSiteSettings: (settings) => ({ ...settings, theme }) });
  // getChaiBuilder resolves its own context; without this it falls back to an env app key unset in CI.
  setChaiContextResolver(async () => ({ appId: TEST_APP_ID, draft: true }));
  return withRequestContext(async () => {
    const stream = await renderToReadableStream(<ChaiPageCSS page={page} />);
    await stream.allReady;
    return new Response(stream).text();
  });
};

describe("ChaiPageCSS site content width", () => {
  it("emits --site-content-width for the site layout in the page styles", async () => {
    const html = await render({ siteLayout: "container" });
    expect(html).toMatch(/<style id="page-styles">[^<]*--site-content-width: 1280px/);
  });
});
