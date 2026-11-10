import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { ArticleGrid } from "../reader-layout/reader-layout";
import { ArticleCard } from "../article-card/article-card";
import styles from "./home-featured.module.css";
export function HomeFeatured({ articles }: { articles: PublicArticleCard[] }) {
  if (!articles.length) return null;
  return (
    <section className={styles.featured} aria-labelledby="home-featured-title">
      <h2 id="home-featured-title">Featured News</h2>
      <ArticleGrid>
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </ArticleGrid>
    </section>
  );
}
