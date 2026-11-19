import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import styles from "./preview-meta.module.css";

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "America/New_York",
  }).format(new Date(iso));

// Small byline and date, side by side, under a preview's image. Plain text:
// previews are a single link to the story, and author pages are linked from
// the article itself.
export function PreviewMeta({
  article,
  className,
}: {
  article: Pick<PublicArticleCard, "writers" | "owner" | "publishedAt">;
  className?: string;
}) {
  const people = article.writers.length ? article.writers : [article.owner];
  return (
    <p className={`${styles.meta} ${className ?? ""}`}>
      <span>{people.map((person) => person.displayName).join(", ")}</span>
      <span aria-hidden="true" className={styles.dot}>
        ·
      </span>
      <time dateTime={article.publishedAt}>
        {formatDate(article.publishedAt)}
      </time>
    </p>
  );
}
