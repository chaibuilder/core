import "~/server/only-server";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { after } from "next/server";
import { createInvalidateTagAdapter } from "~/nextjs/invalidate-tag";
import { setFrameworkAdapter, type ChaiFrameworkAdapter } from "~/server/framework-adapter";

/**
 * Registers the Next.js framework adapter as a module side effect.
 *
 * This is THE registration point — without it `getFrameworkAdapter()` stays the noop
 * adapter, `withPersistentCache` never tags its cache entries, and publish-time
 * revalidation (`handleCacheRevalidation`) silently purges nothing. Evaluated by
 * `~/nextjs/server` on any value import; a host that only ever `import type`s from that entry
 * needs a value import of it (`import "<pkg>/nextjs/server";`) — this module has no published
 * subpath of its own — unless an edition entry point it uses imports it lazily first.
 *
 * Registration is idempotent (last one wins), so loading this module from several
 * bundles is safe.
 */
setFrameworkAdapter({
  persistentCache: unstable_cache as ChaiFrameworkAdapter["persistentCache"],
  invalidatePath: revalidatePath,
  invalidateTag: createInvalidateTagAdapter(revalidateTag as ChaiFrameworkAdapter["invalidateTag"]),
  runAfterResponse: after,
  pageNotFound: notFound,
  // Server components can only emit 308/307, not literal 301/302. SEO-equivalent for crawlers.
  redirect: ((path: string, permanent?: boolean) =>
    permanent ? permanentRedirect(path) : redirect(path)) as ChaiFrameworkAdapter["redirect"],
});
