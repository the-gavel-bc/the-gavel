import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import {
  publicArticleImageUrl,
  type ArticleImageUrl,
  type ReaderArticle,
} from "@/shared/reader/reader-article/reader-article";
import styles from "./article-header.module.css";

// Credited writers in order, or the article owner when none are credited,
// matching the byline on previews. People with an author page are links.
const byline = (article: ReaderArticle) => {
  const writers = article.contributors
    .filter((person) => person.role === "writer")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return writers.length ? writers : [article.owner];
};

export function ArticleHeader({
  article,
  imageUrl = publicArticleImageUrl,
  linkSection = true,
}: {
  article: ReaderArticle;
  imageUrl?: ArticleImageUrl;
  linkSection?: boolean;
}) {
  return (
    <header className={styles.header}>
      {linkSection ? (
        <Link className={styles.kicker} href={sectionHref(article.section)}>
          {article.section.name}
        </Link>
      ) : (
        <span className={styles.kicker}>{article.section.name}</span>
      )}
      <h1>{article.title}</h1>
      {article.excerpt && <p className={styles.dek}>{article.excerpt}</p>}
      <p className={styles.date}>
        <span>
          By{" "}
          {byline(article).map((person, index) => (
            <span key={`${person.slug ?? person.displayName}:${index}`}>
              {index > 0 && ", "}
              {person.slug ? (
                <Link
                  className={styles.author}
                  href={`/authors/${person.slug}`}
                >
                  {person.displayName}
                </Link>
              ) : (
                person.displayName
              )}
            </span>
          ))}
        </span>
        <span aria-hidden="true"> · </span>
        <time dateTime={article.publishedAt}>
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "long",
            timeZone: "America/New_York",
          }).format(new Date(article.publishedAt))}
        </time>
      </p>
      {article.mainImage && (
        <figure>
          {/* Keep authorized media outside the image optimizer's derivative cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(article.id, article.mainImage.id)}
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
