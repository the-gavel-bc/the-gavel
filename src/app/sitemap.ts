import type { MetadataRoute } from "next";
import { getPublicSitemap } from "@/backend/reader/public-sitemap/public-sitemap";

// Publication state is checked on every request; never prerender or cache.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result = await getPublicSitemap();
  if (result.kind !== "ok") throw new Error("Sitemap unavailable");
  return result.entries;
}
