import Link from "next/link";
import type { ReaderArticle } from "@/shared/reader/reader-article/reader-article";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { ArticleCard } from "../article-card/article-card";
import { ReaderImage } from "@/frontend/components/reader-image/reader-image";
import styles from "./article-context.module.css";

export function ArticleContext({
  article,
  related,
  linkTopics = true,
}: {
  article: ReaderArticle;
  related: PublicArticleCard[];
  linkTopics?: boolean;
}) {
  const Topics = linkTopics ? "nav" : "section";
  return (
    <div className={styles.context}>
      {(article.categories.length > 0 || article.tags.length > 0) && (
        <Topics className={styles.topics} aria-label="Article topics">
          {article.categories.length > 0 && (
            <div>
              <h2>Categories</h2>
              <ul>
                {article.categories.map((category) => (
                  <li key={category.id}>
                    {linkTopics ? (
                      <Link
                        className={styles.topicChip}
                        href={`/sections/${article.section.slug}/categories/${category.slug}`}
                      >
                        {category.name}
                      </Link>
                    ) : (
                      <span className={styles.topicChip}>{category.name}</span>
                    )}
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
                    {linkTopics ? (
                      <Link
                        className={styles.topicChip}
                        href={`/tags/${tag.slug}`}
                      >
                        {tag.name}
                      </Link>
                    ) : (
                      <span className={styles.topicChip}>{tag.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Topics>
      )}
      {article.owner.biography && article.owner.slug && (
        <section className={styles.bio}>
          {article.owner.photoUrl && (
            <ReaderImage
              className={styles.photo}
              src={article.owner.photoUrl}
              width={96}
              height={96}
              alt={`Photo of ${article.owner.displayName}`}
              decoding="async"
            />
          )}
          <div>
            <h2>About {article.owner.displayName}</h2>
            <p>{article.owner.biography}</p>
            <Link
              className={styles.more}
              href={`/authors/${article.owner.slug}`}
            >
              More from {article.owner.displayName}
            </Link>
          </div>
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
