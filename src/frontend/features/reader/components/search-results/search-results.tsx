import type { PublicSearchResult } from "@/shared/reader/public-search/public-search";
import { SearchForm } from "../search-form/search-form";
import { ArticleGrid } from "../reader-layout/reader-layout";
import { ArticleCard } from "../article-card/article-card";
import { ArticlePagination } from "../pagination/pagination";
import styles from "./search-results.module.css";
const searchHref = (query: string, cursor?: string) => {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set("cursor", cursor);
  return `/search?${params}`;
};
export function SearchResults({
  result,
  query,
  cursor,
}: {
  result: PublicSearchResult | { kind: "prompt" };
  query: string;
  cursor?: string;
}) {
  return (
    <div className={styles.page}>
      <h1>Search articles</h1>
      <SearchForm
        id="article-search-query"
        query={query}
        invalid={result.kind === "invalid"}
      />
      {result.kind === "prompt" && (
        <p>Enter a few words to find published stories.</p>
      )}
      {result.kind === "invalid" && (
        <p>
          This search or page link is invalid. Adjust your search or{" "}
          <a href={searchHref(query)}>start a new search</a>.
        </p>
      )}
      {result.kind === "unavailable" && (
        <>
          <h2>Search temporarily unavailable</h2>
          <p>Please try again in a moment.</p>
          <a href={searchHref(query, cursor)}>Retry search</a>
        </>
      )}
      {result.kind === "rate_limited" && (
        <>
          <h2>Search is busy</h2>
          <p>
            Please wait up to {result.retryAfter}{" "}
            {result.retryAfter === 1 ? "second" : "seconds"} before trying
            again.
          </p>
          <a href={searchHref(query, cursor)}>Retry search</a>
        </>
      )}
      {result.kind === "ok" && (
        <>
          <h2>Results for “{result.query}”</h2>
          {result.items.length > 0 ? (
            <>
              <p>
                {result.items.length}{" "}
                {result.items.length === 1 ? "story" : "stories"} on this page.
                Newest first.
              </p>
              <ArticleGrid>
                {result.items.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    headingLevel={3}
                  />
                ))}
              </ArticleGrid>
            </>
          ) : (
            <p>
              {cursor
                ? "No more stories match this search."
                : "No stories match this search. Try different words."}
            </p>
          )}
          {cursor && (
            <p>
              <a href={searchHref(result.query)}>Newest results</a>
            </p>
          )}
          {/* A speculative page read would spend another global search ticket. */}
          <ArticlePagination
            nextHref={
              result.nextCursor
                ? searchHref(result.query, result.nextCursor)
                : null
            }
            prefetch={false}
          />
        </>
      )}
    </div>
  );
}
