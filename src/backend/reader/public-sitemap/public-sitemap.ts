import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { getPublicSiteNavigation } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { LETTERS_SECTION_SLUG } from "@/shared/reader/section-link/section-link";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import {
  publicSlugSchema,
  publicTimestampSchema,
} from "@/backend/public-articles/article-card-schema/article-card-schema";

const PAGE = 1000;
// ponytail: one sitemap file; split with generateSitemaps before the catalog nears 50,000 URLs.
const MAX_URLS = 50_000;

const slug = (max: number) => publicSlugSchema.max(max);
const slugs = (max: number) => z.array(slug(max)).max(64);
const articlesSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("invalid") }),
  z.strictObject({
    kind: z.literal("rate_limited"),
    retryAfter: z.number().int().min(1).max(60),
  }),
  z.strictObject({
    kind: z.literal("ok"),
    items: z
      .array(
        z.strictObject({
          id: z.string().refine(isDraftUuid),
          slug: slug(180),
          publishedAt: publicTimestampSchema,
          section: slug(120),
          categories: slugs(120),
          tags: slugs(120),
          authors: slugs(180),
        }),
      )
      .max(PAGE),
    hasMore: z.boolean(),
  }),
]);

export type SitemapEntry = { url: string; lastModified?: string };
export type PublicSitemapResult =
  | { kind: "ok"; entries: SitemapEntry[] }
  | { kind: "rate_limited"; retryAfter: number }
  | { kind: "unavailable" };

const unavailable = { kind: "unavailable" } as const;

// Request-time read through the anonymous projection; SQL owns visibility.
// Archive pages are derived from the listed articles themselves, so every
// listed archive has a listed article even if publication changes between
// pages. A change mid-read is reflected on the next request.
export async function getPublicSitemap(): Promise<PublicSitemapResult> {
  try {
    const client = createPublicReaderClient();
    const site = await getPublicSiteNavigation();
    const articles: SitemapEntry[] = [];
    const seen = new Set<string>();
    const sections = new Set<string>();
    const categories = new Set<string>();
    const tags = new Set<string>();
    const authors = new Set<string>();

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
      if (!page.success || page.data.kind === "invalid") return unavailable;
      if (page.data.kind === "rate_limited") return page.data;
      const { items, hasMore } = page.data;
      for (const item of items) {
        if (seen.has(item.slug)) continue;
        seen.add(item.slug);
        articles.push({
          url: `/articles/${item.slug}`,
          lastModified: item.publishedAt,
        });
        sections.add(item.section);
        for (const c of item.categories) categories.add(`${item.section}/${c}`);
        for (const t of item.tags) tags.add(t);
        for (const a of item.authors) authors.add(a);
      }
      if (
        articles.length +
          sections.size +
          categories.size +
          tags.size +
          authors.size +
          3 >
        MAX_URLS
      )
        return unavailable;
      if (!hasMore) break;
      if (items.length !== PAGE) return unavailable;
      after = items[PAGE - 1];
    }

    const paths: string[] = ["/"];
    // Navigation supplies copy flags for the information pages.
    const info = site.kind === "ok" ? site.information : null;
    if (info?.mission?.trim()) paths.push("/about");
    if (info?.submissionInstructions?.trim())
      paths.push("/letters/how-to-submit");
    const sorted = (set: Set<string>) => [...set].sort();
    for (const s of sorted(sections))
      paths.push(s === LETTERS_SECTION_SLUG ? "/letters" : `/sections/${s}`);
    for (const c of sorted(categories)) {
      const [section, category] = c.split("/");
      paths.push(`/sections/${section}/categories/${category}`);
    }
    for (const t of sorted(tags)) paths.push(`/tags/${t}`);
    for (const a of sorted(authors)) paths.push(`/authors/${a}`);

    const origin = getServerEnv().SITE_URL;
    const absolute = (entry: SitemapEntry) => ({
      ...entry,
      url: new URL(entry.url, origin).href,
    });
    return {
      kind: "ok",
      entries: [...paths.map((url) => ({ url })), ...articles].map(absolute),
    };
  } catch {
    return unavailable;
  }
}
