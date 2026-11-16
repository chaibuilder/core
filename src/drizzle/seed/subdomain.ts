import { eq } from "drizzle-orm";
import { kebabCase } from "lodash-es";
import { nanoid } from "nanoid";
import type { ChaiBuilderInstance } from "~/types/chaibuilder-config";

const BASE_DOMAIN = "localhost";

function slugFromAppName(name: string): string {
  const slug = kebabCase(name.trim()).replace(/^-+|-+$/g, "");
  return slug.slice(0, 48) || "app";
}

export async function buildUniqueSubdomain(cb: ChaiBuilderInstance, appName: string): Promise<string> {
  const { db, schema } = cb;
  const baseSlug = slugFromAppName(appName);
  let slug = baseSlug;

  for (let attempt = 0; attempt < 20; attempt++) {
    const subdomain = `${slug}.${BASE_DOMAIN}`;
    const existing = await db
      .select({ id: schema.appDomains.id })
      .from(schema.appDomains)
      .where(eq(schema.appDomains.subdomain, subdomain))
      .limit(1);

    if (existing.length === 0) {
      return subdomain;
    }

    slug = `${baseSlug}-${nanoid(6).toLowerCase()}`;
  }

  throw new Error(`buildUniqueSubdomain: could not allocate subdomain for "${appName}"`);
}
