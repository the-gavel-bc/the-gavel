import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryMeta } from "../story-meta/story-meta";
import styles from "./article-card.module.css";

export function ArticleCard({
  article,
  headingLevel = 3,
}: {
  article: PublicArticleCard;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={styles.card}>
      <Link
        className={styles.section}
        href={`/sections/${encodeURIComponent(article.section.slug)}`}
      >
        {article.section.name}
      </Link>
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <div className={styles.image}>
          {article.mainImage ? (
            // Use the authorized route directly: optimization could retain stale derivatives.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/public/articles/${article.id}/media/${article.mainImage.id}`}
              alt={article.mainImage.alt}
              width={article.mainImage.width}
              height={article.mainImage.height}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className={styles.missing}>No image</span>
          )}
        </div>
        <Heading className={styles.title}>{article.title}</Heading>
      </Link>
      {article.mainImage && (
        <p className={styles.credit}>Photo: {article.mainImage.credit}</p>
      )}
      <StoryMeta article={article} />
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
    </article>
  );
}
