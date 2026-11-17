import Link from "next/link";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { ArticleCard } from "../article-card/article-card";
import styles from "./article-context.module.css";

export function ArticleContext({
  article,
  related,
}: {
  article: PublicArticle;
  related: PublicArticleCard[];
}) {
  return (
    <div className={styles.context}>
      {(article.categories.length > 0 || article.tags.length > 0) && (
        <nav aria-label="Article topics">
          {article.categories.length > 0 && (
            <div>
              <h2>Categories</h2>
              <ul>
                {article.categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/sections/${article.section.slug}/categories/${category.slug}`}
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {article.tags.length > 0 && (
            <div>
              <h2>Tags</h2>
              <ul>
                {article.tags.map((tag) => (
                  <li key={tag.id}>
                    <Link href={`/tags/${tag.slug}`}>{tag.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      )}
      {article.owner.biography && (
        <section className={styles.bio}>
          <h2>About {article.owner.displayName}</h2>
          <p>{article.owner.biography}</p>
          <Link className={styles.more} href={`/authors/${article.owner.slug}`}>
            More from {article.owner.displayName}
          </Link>
        </section>
      )}
      {related.length > 0 && (
        <aside aria-labelledby="keep-reading">
          <h2 id="keep-reading">Keep reading</h2>
          <div className={styles.grid}>
            {related.map((story) => (
              <ArticleCard key={story.id} article={story} />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
