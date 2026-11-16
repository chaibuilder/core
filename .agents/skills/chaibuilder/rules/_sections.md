# Sections

Defines all sections, their ordering, prefixes, and descriptions.
The prefix (in parentheses) is used as the filename prefix to group rules.

---

## 1. Extend Builder UI (extend-ui)

**Impact:** HIGH  
**Description:** APIs for customising the ChaiBuilder editor — adding sidebar panels, injecting components via slots, hooking into lifecycle events, registering feature flags, custom tabs, and block libraries. All APIs are client-only and must be called at module level before `ChaiWebsiteBuilder` mounts.

## 2. Custom Blocks (blocks) ✅

**Impact:** HIGH  
**Description:** Defining and registering custom block components with typed props schemas, styles, and builder-only props. Uses `registerChaiBlock`, `registerChaiBlockProps`, `stylesProp`, `builderProp`, and `closestBlockProp` from `@chaibuilder/core/registry`.

## 3. Server Setup (server)

**Impact:** HIGH  
**Description:** Configuring `buildChaiBuilderConfig`, registering server actions via `initChaiActionHandler`, setting up `withChaiBuilder` in `next.config.ts`, and implementing `ChaiBaseAction` / `ChaiBaseAIAction`.

## 4. Page Rendering (render)

**Impact:** HIGH  
**Description:** Rendering ChaiBuilder pages in Next.js using `RenderChaiBlocks`, `ChaiPageCSS`, `getStylesForBlocks`, and `getMergedPartialBlocks` from `@chaibuilder/core/render`.
