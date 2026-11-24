import Link from "next/link";
import { sectionHref } from "@/shared/reader/section-link/section-link";
import type { ReactNode } from "react";
import type { PublicArchiveResult } from "@/backend/public-articles/public-archive/public-archive";
import { ArchiveHeader } from "../archive-header/archive-header";
import { ArticleCard } from "../article-card/article-card";
import { ArticlePagination } from "../pagination/pagination";
import { ArchiveLead } from "./archive-lead";
import { ArchiveMore } from "./archive-more";
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
        <ArticlePagination newestHref={archive.href} />
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
          <ArchiveLead article={lead} />
        </div>
      )}
      <ArchiveMore
        href={archive.href}
        newestHref={result.continuation ? archive.href : null}
        nextCursor={result.nextCursor}
        empty={
          <>
            {result.items.length === 0 &&
              (result.continuation ? (
                <h2>No more articles</h2>
              ) : (
                <ReaderState
                  kind="empty"
                  action={
                    archive.category && archive.section
                      ? {
                          href: sectionHref(archive.section),
                          label: `See all ${archive.section.name} stories`,
                        }
                      : undefined
                  }
                />
              ))}
          </>
        }
      >
        {cards.map((article) => (
          <ArticleCard key={article.id} article={article} headingLevel={2} />
        ))}
      </ArchiveMore>
    </div>
  );
}
