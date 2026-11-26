import { STORY_IMAGE_SIZES } from "@/shared/reader/public-image/public-image";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import styles from "./home-hero.module.css";

const longDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "America/New_York",
});

// Lead story: the biggest thing on the page. Full-bleed image with the
// section pill, headline and date over it, beside the Latest column.
export function HomeHero({ article }: { article: PublicArticleCard }) {
  return (
    <article className={styles.hero}>
      <Link
        className={styles.story}
        href={`/articles/${encodeURIComponent(article.slug)}`}
        aria-label={article.title}
      >
        <StoryImage
          sizes={STORY_IMAGE_SIZES.hero}
          article={article}
          eager
          className={styles.image}
        />
        <div className={styles.overlay}>
          <span className={styles.pill}>{article.section.name}</span>
          <h2 className={styles.title}>{article.title}</h2>
          <time className={styles.date} dateTime={article.publishedAt}>
            {longDate.format(new Date(article.publishedAt))}
          </time>
        </div>
      </Link>
    </article>
  );
}
