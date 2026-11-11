import { sectionHref } from "@/shared/reader/section-link/section-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryMeta } from "../story-meta/story-meta";
import styles from "./home-hero.module.css";
export function HomeHero({ article }: { article: PublicArticleCard }) {
  return (
    <article className={styles.hero}>
      <Link className={styles.section} href={sectionHref(article.section)}>
        {article.section.name}
      </Link>
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        {article.mainImage && (
          <div className={styles.image}>
            {/* Authorized route stays outside image optimization to preserve cache expiry. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/public/articles/${article.id}/media/${article.mainImage.id}`}
              alt={article.mainImage.alt}
              width={article.mainImage.width}
              height={article.mainImage.height}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </div>
        )}
        <h2>{article.title}</h2>
      </Link>
      {article.mainImage && (
        <p className={styles.credit}>Photo: {article.mainImage.credit}</p>
      )}
      <StoryMeta article={article} />
      {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}
    </article>
  );
}
