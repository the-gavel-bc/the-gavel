import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import { PreviewMeta } from "../preview-meta/preview-meta";
import styles from "./article-card.module.css";

export function ArticleCard({
  article,
  headingLevel = 3,
  variant = "full",
}: {
  article: PublicArticleCard;
  headingLevel?: 2 | 3;
  // Previews show image, byline and date, title and summary (no photo
  // credit); "home" also drops the section label, as on the live rows.
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
        <PreviewMeta article={article} className={styles.meta} />
        <Heading className={styles.title}>{article.title}</Heading>
      </Link>
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
    </article>
  );
}
