import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import { PreviewMeta } from "../preview-meta/preview-meta";
import styles from "./home-hero.module.css";
// Lead story: image with the headline and date overlaid, as on the live site.
export function HomeHero({ article }: { article: PublicArticleCard }) {
  return (
    <article className={styles.hero}>
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <StoryImage article={article} eager className={styles.image} />
        <div className={styles.overlay}>
          <h2 className={styles.title}>{article.title}</h2>
          {article.excerpt && (
            <p className={styles.excerpt}>{article.excerpt}</p>
          )}
          <PreviewMeta article={article} className={styles.meta} />
        </div>
      </Link>
    </article>
  );
}
