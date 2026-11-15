import Link from "next/link";
import { sectionHref } from "@/shared/reader/section-link/section-link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { PreviewMeta } from "../preview-meta/preview-meta";
import { StoryImage } from "../story-image/story-image";
import styles from "./archive-lead.module.css";

// A section's newest story: photo beside the headline on wide screens, so the
// title stays readable without an overlay and the lead spans the page.
export function ArchiveLead({ article }: { article: PublicArticleCard }) {
  return (
    <article className={styles.lead}>
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <StoryImage article={article} eager className={styles.image} />
        <div className={styles.text}>
          <PreviewMeta article={article} />
          <h2 className={styles.title}>{article.title}</h2>
          {article.excerpt && (
            <p className={styles.excerpt}>{article.excerpt}</p>
          )}
        </div>
      </Link>
      <Link className={styles.section} href={sectionHref(article.section)}>
        {article.section.name}
      </Link>
    </article>
  );
}
