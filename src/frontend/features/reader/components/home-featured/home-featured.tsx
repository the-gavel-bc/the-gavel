import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import { PreviewMeta } from "../preview-meta/preview-meta";
import styles from "./home-featured.module.css";
// Full-width blue band of stories, as on the live site; on phones the
// stories form one row that scrolls sideways.
export function HomeFeatured({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.featured} aria-labelledby="home-featured-title">
      <div className={styles.inner}>
        <h2 id="home-featured-title">Featured News</h2>
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
                  <PreviewMeta article={article} />
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
