import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import { PreviewMeta } from "../preview-meta/preview-meta";
import styles from "./article-card.module.css";

// Marks whole-word, case-insensitive matches of the query's words. Text is
// split, never parsed as HTML.
function Highlighted({ text, query }: { text: string; query: string }) {
  // Letters and digits only, so punctuation in the query needs no escaping.
  const words = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return text;
  const parts = text.split(new RegExp(`\\b(${words.join("|")})\\b`, "gi"));
  return parts.map((part, index) =>
    index % 2 ? <mark key={index}>{part}</mark> : part,
  );
}

export function ArticleCard({
  article,
  headingLevel = 3,
  variant = "full",
  highlight,
}: {
  article: PublicArticleCard;
  headingLevel?: 2 | 3;
  // Previews show image, byline and date, title and summary (no photo
  // credit); "home" also drops the section label, as on the live rows.
  variant?: "full" | "home";
  // Search words to mark in the title.
  highlight?: string;
}) {
  const home = variant === "home";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className={`${styles.card} ${home ? styles.home : ""}`}>
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
        <Heading className={styles.title}>
          {highlight ? (
            <Highlighted text={article.title} query={highlight} />
          ) : (
            article.title
          )}
        </Heading>
      </Link>
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
    </article>
  );
}
