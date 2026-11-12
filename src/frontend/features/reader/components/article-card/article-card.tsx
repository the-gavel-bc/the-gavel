import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryDate, StoryMeta } from "../story-meta/story-meta";
import { StoryImage } from "../story-image/story-image";
import styles from "./article-card.module.css";

export function ArticleCard({
  article,
  headingLevel = 3,
  variant = "full",
}: {
  article: PublicArticleCard;
  headingLevel?: 2 | 3;
  // "home" matches the live homepage rows: image, title, date and excerpt.
  variant?: "full" | "home";
}) {
  const home = variant === "home";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={styles.card}>
      {!home && (
        <Link className={styles.section} href={sectionHref(article.section)}>
          {article.section.name}
        </Link>
      )}
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <StoryImage article={article} className={styles.image} />
        <Heading className={styles.title}>{article.title}</Heading>
      </Link>
      {article.mainImage && (
        <p className={styles.credit}>Photo: {article.mainImage.credit}</p>
      )}
      {home ? (
        <StoryDate publishedAt={article.publishedAt} />
      ) : (
        <StoryMeta article={article} />
      )}
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
    </article>
  );
}
