import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryDate } from "../story-meta/story-meta";
import { StoryImage } from "../story-image/story-image";
import layout from "../reader-layout/reader-layout.module.css";
import styles from "./home-featured.module.css";
// Full-width blue band with compact thumbnail rows, as on the live site.
export function HomeFeatured({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.featured} aria-labelledby="home-featured-title">
      <div className={styles.inner}>
        <h2 id="home-featured-title">Featured News</h2>
        <ol className={layout.reveal}>
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                className={styles.story}
                href={`/articles/${encodeURIComponent(article.slug)}`}
                aria-label={article.title}
              >
                <StoryImage article={article} className={styles.thumb} />
                <div className={styles.text}>
                  <StoryDate
                    publishedAt={article.publishedAt}
                    className={styles.date}
                  />
                  <h3>{article.title}</h3>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
