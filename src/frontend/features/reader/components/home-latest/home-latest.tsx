import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryImage } from "../story-image/story-image";
import { PreviewMeta } from "../preview-meta/preview-meta";
import layout from "../reader-layout/reader-layout.module.css";
import styles from "./home-latest.module.css";
// Stories beside the lead: thumbnail, headline and date.
export function HomeLatest({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.latest} aria-labelledby="home-latest-title">
      <h2 id="home-latest-title" className={styles.srOnly}>
        Latest
      </h2>
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
                <PreviewMeta article={article} />
                <h3>{article.title}</h3>
                {article.excerpt && (
                  <p className={styles.excerpt}>{article.excerpt}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
