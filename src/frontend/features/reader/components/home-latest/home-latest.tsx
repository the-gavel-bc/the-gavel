import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import styles from "./home-latest.module.css";

const longDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

// Stories beside the lead: square thumbnail, headline and date.
export function HomeLatest({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.latest} aria-labelledby="home-latest-title">
      <h2 id="home-latest-title" className={styles.heading}>
        Latest
      </h2>
      <ol>
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              className={styles.story}
              href={`/articles/${encodeURIComponent(article.slug)}`}
              aria-label={article.title}
            >
              <StoryImage article={article} className={styles.thumb} />
              <div className={styles.text}>
                <h3>{article.title}</h3>
                <time dateTime={article.publishedAt}>
                  {longDate.format(new Date(article.publishedAt))}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
