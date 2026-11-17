import { ArticlePageLink } from "../article-page-link/article-page-link";
import { LinkButton } from "@/frontend/components/ui/link-button/link-button";
import type { ArticlePage } from "@/backend/articles/draft-queries/draft-queries";
import { ArticleRowActions } from "../article-row-actions/article-row-actions";
import { StatusBadge } from "../status-badge/status-badge";
import toolbar from "../admin-articles/admin-articles.module.css";
import styles from "./article-list.module.css";
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  // Staff work in Boston: Eastern time, labelled "ET".
  timeZone: "America/New_York",
});

type Status = "all" | "draft" | "published" | "archived";

// Rendered outside the "Your articles" region, so its status options are
// never mistaken for a row's status.
export function ArticleFilters({
  status = "all",
  search = "",
}: {
  status?: Status;
  search?: string;
}) {
  return (
    <form action="/dashboard" method="get" className={toolbar.filters}>
      <div className={toolbar.field}>
        <label htmlFor="my-article-search">Search my article titles</label>
        <input
          id="my-article-search"
          name="search"
          type="search"
          maxLength={80}
          defaultValue={search}
        />
      </div>
      <div className={toolbar.field}>
        <label htmlFor="my-article-status">Status</label>
        <select id="my-article-status" name="status" defaultValue={status}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <button type="submit" className={toolbar.apply}>
        Apply filters
      </button>
    </form>
  );
}

export function ArticleList({
  page,
  status = "all",
  search = "",
}: {
  page: ArticlePage;
  status?: Status;
  search?: string;
}) {
  const filtered = status !== "all" || search !== "";
  const next = new URLSearchParams();
  if (status !== "all") next.set("status", status);
  if (search) next.set("search", search);
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  return (
    <section aria-label="Your articles" className={styles.listing}>
      <div className={styles.actions}>
        <LinkButton href="/dashboard/articles/new" prefetch={false}>
          Create draft
        </LinkButton>
      </div>
      {page.items.length === 0 ? (
        <p className={styles.empty}>
          {filtered
            ? "No articles match these filters."
            : "No articles on this page."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {page.items.map((article) => (
            <li key={article.id} className={styles.row}>
              <h2>{article.title}</h2>
              <p className={styles.metadata}>
                <StatusBadge status={article.status} />
                <span>{article.sectionName}</span>
                <span>
                  Updated{" "}
                  <time dateTime={article.updatedAt}>
                    {date.format(new Date(article.updatedAt))} ET
                  </time>
                </span>
              </p>
              <ArticleRowActions article={article} admin={false} />
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <nav aria-label="Article pages">
          <ArticlePageLink href={`/dashboard?${next}`}>
            Next page
          </ArticlePageLink>
        </nav>
      )}
    </section>
  );
}
