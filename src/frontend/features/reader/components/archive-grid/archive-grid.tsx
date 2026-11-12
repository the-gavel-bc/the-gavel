import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicArchiveResult } from "@/backend/public-articles/public-archive/public-archive";
import { ArchiveHeader } from "../archive-header/archive-header";
import { ArticleGrid } from "../reader-layout/reader-layout";
import { ArticleCard } from "../article-card/article-card";
import { ArticlePagination } from "../pagination/pagination";
import { HomeHero } from "../home-hero/home-hero";
import { ReaderState } from "../reader-states/reader-states";
import styles from "./archive-grid.module.css";

export function ArchiveGrid({
  result,
  introduction,
}: {
  result: Exclude<PublicArchiveResult, { kind: "notFound" }>;
  introduction?: ReactNode;
}) {
  if (result.kind === "unavailable")
    return (
      <div className={styles.page}>
        <h1>Archive temporarily unavailable</h1>
        <p>Please try again in a moment.</p>
        <p>
          <Link href="/">Home</Link>
        </p>
      </div>
    );
  const { archive } = result;
  if (result.kind === "invalid")
    return (
      <div className={styles.page}>
        <ArchiveHeader archive={archive} />
        {introduction}
        <p>This article page is invalid or expired.</p>
        <Link href={archive.href}>Newest articles</Link>
      </div>
    );
  const lead =
    archive.section && !archive.category && !result.continuation
      ? result.items[0]
      : null;
  const cards = lead ? result.items.slice(1) : result.items;
  return (
    <div className={styles.page}>
      <ArchiveHeader archive={archive} />
      {introduction}
      {lead && (
        <div className={styles.lead}>
          <HomeHero article={lead} showSection />
        </div>
      )}
      {cards.length > 0 && (
        <ArticleGrid>
          {cards.map((article) => (
            <ArticleCard key={article.id} article={article} headingLevel={2} />
          ))}
        </ArticleGrid>
      )}
      {result.items.length === 0 &&
        (result.continuation ? (
          <h2>No more articles</h2>
        ) : (
          <ReaderState kind="empty" />
        ))}
      {result.continuation && (
        <p className={styles.newest}>
          <Link href={archive.href}>Newest articles</Link>
        </p>
      )}
      <ArticlePagination
        nextHref={
          result.nextCursor
            ? `${archive.href}?cursor=${encodeURIComponent(result.nextCursor)}`
            : null
        }
      />
    </div>
  );
}
