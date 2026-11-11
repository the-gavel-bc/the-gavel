import { excludedMetadata } from "@/backend/reader/public-metadata/public-metadata";
import type { Metadata } from "next";
import { searchPublicArticles } from "@/backend/public-articles/public-search/public-search";
import { normalizePublicSearchQuery } from "@/shared/reader/public-search/public-search";
import { SearchResults } from "@/frontend/features/reader/components/search-results/search-results";
export const dynamic = "force-dynamic";
// Static metadata avoids a second quota-bearing read and never indexes queries.
export const metadata: Metadata = excludedMetadata("Search articles");
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; cursor?: string | string[] }>;
}) {
  const { q, cursor } = await searchParams;
  const text = typeof q === "string" && Array.from(q).length <= 512 ? q : "";
  if (
    Array.isArray(q) ||
    Array.isArray(cursor) ||
    (q !== undefined && !text && q !== "") ||
    (!text.trim() && cursor !== undefined)
  )
    return <SearchResults query={text} result={{ kind: "invalid" }} />;
  if (!text.trim())
    return <SearchResults query="" result={{ kind: "prompt" }} />;
  const query = normalizePublicSearchQuery(text);
  if (!query)
    return <SearchResults query={text} result={{ kind: "invalid" }} />;
  const result = await searchPublicArticles({
    query,
    ...(cursor !== undefined ? { cursor } : {}),
  });
  return <SearchResults query={query} cursor={cursor} result={result} />;
}
