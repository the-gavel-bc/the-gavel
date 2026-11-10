import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { StoryMeta } from "../story-meta/story-meta";
import styles from "./home-latest.module.css";
export function HomeLatest({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.latest} aria-labelledby="home-latest-title">
      <h2 id="home-latest-title">Latest</h2>
      <ol>
        {articles.map((article) => (
          <li key={article.id}>
            <h3>
              <Link href={`/articles/${encodeURIComponent(article.slug)}`}>
                {article.title}
              </Link>
            </h3>
            <StoryMeta article={article} />
          </li>
        ))}
      </ol>
    </section>
  );
}
