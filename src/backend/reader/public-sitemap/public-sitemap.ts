import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { getPublicSiteNavigation } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { isLettersSection } from "@/backend/public-articles/public-archive/public-archive";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import {
  publicSlugSchema,
  publicTimestampSchema,
} from "@/backend/public-articles/article-card-schema/article-card-schema";

const PAGE = 1000;
// ponytail: one sitemap file; split with generateSitemaps before the catalog nears 50,000 URLs.
const MAX_URLS = 50_000;

const slug = (max: number) => publicSlugSchema.max(max);
const archivesSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({
    kind: z.literal("ok"),
    sections: z.array(slug(120)).max(5000),
    categories: z
      .array(z.strictObject({ section: slug(120), slug: slug(120) }))
      .max(5000),
    tags: z.array(slug(120)).max(5000),
    authors: z.array(slug(180)).max(5000),
  }),
]);
const articlesSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invalid") }),
  z.strictObject({
    kind: z.literal("ok"),
    items: z
      .array(
        z.strictObject({
          id: z.string().refine(isDraftUuid),
          slug: slug(180),
          publishedAt: publicTimestampSchema,
        }),
      )
      .max(PAGE),
    hasMore: z.boolean(),
  }),
]);

export type SitemapEntry = { url: string; lastModified?: string };
export type PublicSitemapResult =
  { kind: "ok"; entries: SitemapEntry[] } | { kind: "unavailable" };

const unavailable = { kind: "unavailable" } as const;

// Request-time read through the anonymous projection; SQL owns visibility.
export async function getPublicSitemap(): Promise<PublicSitemapResult> {
  try {
    const client = createPublicReaderClient();
    const [site, archiveResponse] = await Promise.all([
      getPublicSiteNavigation(),
      client.rpc("list_public_sitemap_archives"),
    ]);
    if (archiveResponse.error) return unavailable;
    const archives = archivesSchema.safeParse(archiveResponse.data);
    if (!archives.success || archives.data.kind !== "ok") return unavailable;

    const origin = getServerEnv().SITE_URL;
    const entries: SitemapEntry[] = [];
    const add = (path: string, lastModified?: string) =>
      entries.push({
        url: new URL(path, origin).href,
        ...(lastModified && { lastModified }),
      });

    add("/");
    // Navigation only supplies copy flags and the letters label. Without it,
    // omit those pages and list letters at its section path, which also resolves.
    const info = site.kind === "ok" ? site.information : null;
    if (info?.mission?.trim()) add("/about");
    if (info?.submissionInstructions?.trim()) add("/letters/how-to-submit");
    const letters = new Set(
      site.kind === "ok"
        ? site.sections.filter(isLettersSection).map((s) => s.slug)
        : [],
    );
    const { sections, categories, tags, authors } = archives.data;
    for (const s of sections)
      add(letters.has(s) ? "/letters" : `/sections/${s}`);
    for (const c of categories)
      add(`/sections/${c.section}/categories/${c.slug}`);
    for (const t of tags) add(`/tags/${t}`);
    for (const a of authors) add(`/authors/${a}`);

    let after: { publishedAt: string; id: string } | null = null;
    for (;;) {
      const { data, error } = await client.rpc("list_public_sitemap_articles", {
        // Generated Supabase function types omit SQL parameter nullability.
        p_after_published_at: (after?.publishedAt ?? null) as string,
        p_after_id: (after?.id ?? null) as string,
        p_limit: PAGE,
      });
      if (error) return unavailable;
      const page = articlesSchema.safeParse(data);
      if (!page.success || page.data.kind !== "ok") return unavailable;
      const { items, hasMore } = page.data;
      for (const item of items) add(`/articles/${item.slug}`, item.publishedAt);
      if (entries.length > MAX_URLS) return unavailable;
      if (!hasMore) return { kind: "ok", entries };
      if (items.length !== PAGE) return unavailable;
      after = items[PAGE - 1];
    }
  } catch {
    return unavailable;
  }
}
