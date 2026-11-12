import Link from "next/link";
import { sectionHref } from "@/shared/reader/section-link/section-link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryDate } from "../story-meta/story-meta";
import { StoryImage } from "../story-image/story-image";
import styles from "./home-hero.module.css";
// Lead story: image with the headline and date overlaid, as on the live site.
// Archives keep the section link above their promoted story; the homepage
// hero matches the live site, which has none.
export function HomeHero({
  article,
  showSection = false,
}: {
  article: PublicArticleCard;
  showSection?: boolean;
}) {
  return (
    <article className={styles.hero}>
      {showSection && (
        <Link className={styles.section} href={sectionHref(article.section)}>
          {article.section.name}
        </Link>
      )}
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <StoryImage article={article} eager className={styles.image} />
        <div className={styles.overlay}>
          <h2 className={styles.title}>{article.title}</h2>
          <StoryDate
            publishedAt={article.publishedAt}
            className={styles.date}
          />
        </div>
      </Link>
      {article.mainImage && (
        <p className={styles.credit}>Photo: {article.mainImage.credit}</p>
      )}
    </article>
  );
}
