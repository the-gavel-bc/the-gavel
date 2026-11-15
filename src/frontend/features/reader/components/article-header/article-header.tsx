import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
import styles from "./article-header.module.css";

// Credited writers in order, or the article owner when none are credited,
// matching the byline on previews.
const byline = (article: PublicArticle) => {
  const writers = article.contributors
    .filter((person) => person.role === "writer")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return (writers.length ? writers : [article.owner])
    .map((person) => person.displayName)
    .join(", ");
};

export function ArticleHeader({ article }: { article: PublicArticle }) {
  return (
    <header className={styles.header}>
      <Link className={styles.kicker} href={sectionHref(article.section)}>
        {article.section.name}
      </Link>
      <h1>{article.title}</h1>
      {article.excerpt && <p className={styles.dek}>{article.excerpt}</p>}
      <p className={styles.date}>
        {/* Plain text; the credits block below links to author pages. */}
        <span>By {byline(article)}</span>
        <span aria-hidden="true"> · </span>
        <time dateTime={article.publishedAt}>
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "long",
            timeZone: "UTC",
          }).format(new Date(article.publishedAt))}
        </time>
      </p>
      {article.mainImage && (
        <figure>
          {/* Keep authorized media outside the image optimizer's derivative cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/public/articles/${article.id}/media/${article.mainImage.id}`}
            width={article.mainImage.width}
            height={article.mainImage.height}
            alt={article.mainImage.alt}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption>
            {article.mainImage.caption && <>{article.mainImage.caption} </>}
            Photo: {article.mainImage.credit}
          </figcaption>
        </figure>
      )}
    </header>
  );
}
