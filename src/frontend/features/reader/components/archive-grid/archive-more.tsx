"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { loadMoreArchiveArticles } from "@/backend/public-articles/archive-more/archive-more-action";
import { ArticleGrid } from "../reader-layout/reader-layout";
import { ArticleCard } from "../article-card/article-card";
import { BackToTop } from "@/frontend/components/site/back-to-top/back-to-top";
import pagination from "../pagination/pagination.module.css";
import styles from "./archive-grid.module.css";

// Appends at most this many batches in place; after that the link opens the
// next page normally, so a long session does not grow the page without end.
const maxLoads = 5;

// "Load more articles": a real link to `?cursor=` (works without JavaScript
// and for crawlers) that, with JavaScript, appends the next stories below.
export function ArchiveMore({
  href,
  newestHref,
  nextCursor,
  empty,
  children,
}: {
  href: string;
  newestHref: string | null;
  nextCursor: string | null;
  /** Shown after the stories (an empty archive or the last page). */
  empty?: React.ReactNode;
  /** The server-rendered stories; loaded ones continue the same grid. */
  children?: React.ReactNode;
}) {
  const [items, setItems] = useState<PublicArticleCard[]>([]);
  const [cursor, setCursor] = useState(nextCursor);
  const [loads, setLoads] = useState(0);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const nextHref = cursor
    ? `${href}?cursor=${encodeURIComponent(cursor)}`
    : null;

  async function load(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      !cursor ||
      loads >= maxLoads ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setStatus("Loading more articles…");
    const result = await loadMoreArchiveArticles(href, cursor).catch(() => ({
      ok: false as const,
    }));
    busy.current = false;
    setPending(false);
    if (!result.ok) {
      // The next press follows the plain link instead.
      setLoads(maxLoads);
      setStatus(
        "More articles could not load. Select Load more articles to open the next page.",
      );
      return;
    }
    const firstNew = result.items[0];
    setItems((current) => [...current, ...result.items]);
    setLoads((count) => count + 1);
    // The address shows the batch just loaded, so it can be shared or reloaded;
    // replacing (not pushing) keeps Back one step out of the archive.
    window.history.replaceState(
      window.history.state,
      "",
      `${href}?cursor=${encodeURIComponent(cursor)}`,
    );
    setCursor(result.nextCursor);
    setStatus(
      result.nextCursor
        ? `${result.items.length} more articles loaded.`
        : `${result.items.length} more articles loaded. No older articles.`,
    );
    // Continue reading from the first new story.
    if (firstNew)
      requestAnimationFrame(() => {
        grid.current
          ?.querySelector<HTMLAnchorElement>(
            `a[href="/articles/${encodeURIComponent(firstNew.slug)}"]`,
          )
          ?.focus();
      });
  }

  return (
    <>
      {(Boolean(children) || items.length > 0) && (
        <div ref={grid} aria-busy={pending}>
          <ArticleGrid>
            {children}
            {items.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                headingLevel={2}
              />
            ))}
          </ArticleGrid>
        </div>
      )}
      {empty}
      {/* Announced to screen readers only. */}
      <p role="status" className={styles.srOnly}>
        {status}
      </p>
      {(newestHref || nextHref) && (
        <nav className={pagination.pagination} aria-label="Article pages">
          {newestHref && <Link href={newestHref}>Newest articles</Link>}
          {nextHref && (
            <a
              href={nextHref}
              rel="next"
              aria-disabled={pending || undefined}
              onClick={(event) => void load(event)}
            >
              {pending ? "Loading…" : "Load more articles"}
            </a>
          )}
        </nav>
      )}
      {loads > 0 && (
        <p className={`${pagination.pagination} ${styles.top}`}>
          <BackToTop>Back to top</BackToTop>
        </p>
      )}
    </>
  );
}
