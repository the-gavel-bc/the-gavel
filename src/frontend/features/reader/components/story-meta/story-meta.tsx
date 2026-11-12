import Link from "next/link";
import { CalendarIcon } from "@/frontend/components/site/site-icons/site-icons";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import styles from "./story-meta.module.css";
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));

// Date with a calendar glyph, as on the live homepage.
export function StoryDate({
  publishedAt,
  className,
}: {
  publishedAt: string;
  className?: string;
}) {
  return (
    <p className={`${styles.date} ${className ?? ""}`}>
      <CalendarIcon />
      <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
    </p>
  );
}

export function StoryMeta({
  article,
}: {
  article: Pick<PublicArticleCard, "writers" | "owner" | "publishedAt">;
}) {
  const people = article.writers.length ? article.writers : [article.owner];
  const date = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(article.publishedAt));
  return (
    <div className={styles.meta}>
      <p>
        By{" "}
        {people.map((person, index) => (
          <span key={person.slug}>
            {index > 0 && ", "}
            <Link href={`/authors/${encodeURIComponent(person.slug)}`}>
              {person.displayName}
            </Link>
          </span>
        ))}
      </p>
      <time dateTime={article.publishedAt}>{date}</time>
    </div>
  );
}
