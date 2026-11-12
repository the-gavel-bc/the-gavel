import Link from "next/link";
import { ArticlePageLink } from "../article-page-link/article-page-link";
import { LinkButton } from "@/frontend/components/ui/link-button/link-button";
import type { ArticlePage } from "@/backend/articles/draft-queries/draft-queries";
import { StatusBadge } from "../status-badge/status-badge";
import styles from "./article-list.module.css";
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function ArticleList({ page }: { page: ArticlePage }) {
  return (
    <section aria-label="Your articles" className={styles.listing}>
      <div className={styles.actions}>
        <LinkButton href="/dashboard/articles/new" prefetch={false}>
          Create draft
        </LinkButton>
      </div>
      {page.items.length === 0 ? (
        <p className={styles.empty}>No articles on this page.</p>
      ) : (
        <ul className={styles.rows}>
          {page.items.map((article) => (
            <li key={article.id} className={styles.row}>
              <h2>{article.title}</h2>
              <p className={styles.metadata}>
                <StatusBadge status={article.status} />
                <span>
                  Updated{" "}
                  <time dateTime={article.updatedAt}>
                    {date.format(new Date(article.updatedAt))} UTC
                  </time>
                </span>
              </p>
              {article.status !== "archived" && (
                <Link
                  href={`/dashboard/articles/${article.id}`}
                  prefetch={false}
                  className={styles.action}
                  aria-label={`${article.status === "draft" ? "Edit draft" : "Edit article"}: ${article.title}`}
                >
                  {article.status === "draft" ? "Edit draft" : "Edit article"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <nav aria-label="Article pages">
          <ArticlePageLink
            href={`/dashboard?${new URLSearchParams({ cursor: page.nextCursor })}`}
          >
            Next page
          </ArticlePageLink>
        </nav>
      )}
    </section>
  );
}
