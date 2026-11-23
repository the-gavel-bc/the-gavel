import { Button } from "@/frontend/components/ui/button/button";
import Link from "next/link";
import type {
  AdminArticlePage,
  AdminArticleSummary,
} from "@/backend/articles/admin-article-queries/admin-article-queries";
import { ArticleRowActions } from "../article-row-actions/article-row-actions";
import { StatusBadge } from "../status-badge/status-badge";
import styles from "./admin-articles.module.css";

const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  // Staff work in Boston: Eastern time, labelled "ET".
  timeZone: "America/New_York",
});

export function AdminArticleMeta({
  article,
}: {
  article: AdminArticleSummary;
}) {
  return (
    <dl className={styles.meta}>
      <div>
        <dt>Status</dt>
        <dd>
          <StatusBadge status={article.status} />
        </dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd>{article.ownerName}</dd>
      </div>
      <div>
        <dt>Section</dt>
        <dd>{article.sectionName}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>
          <time dateTime={article.updatedAt}>
            {date.format(new Date(article.updatedAt))} ET
          </time>
        </dd>
      </div>
    </dl>
  );
}

type View = "all" | "draft" | "published";
const viewLabel: Record<View, string> = {
  all: "Back to all articles",
  draft: "Back to drafts",
  published: "Back to published",
};
export function AdminArticleList({
  page,
  status,
  search,
  from = "all",
  loadFailed = false,
}: {
  page: AdminArticlePage;
  status: "all" | "draft" | "published" | "archived";
  search: string;
  loadFailed?: boolean;
  /** The view the archives were opened from, so the toggle can go back. */
  from?: View;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({ cursor: page.nextCursor })
    : null;
  if (next && status !== "all") next.set("status", status);
  if (next && search) next.set("search", search);
  if (next && status === "archived" && from !== "all") next.set("from", from);
  // One control switches between the archives and the view before them.
  const toggle = new URLSearchParams();
  if (status === "archived") {
    if (from !== "all") toggle.set("status", from);
  } else {
    toggle.set("status", "archived");
    if (status !== "all") toggle.set("from", status);
  }
  if (search) toggle.set("search", search);
  const toggleHref = `/dashboard/admin/articles${toggle.size ? `?${toggle}` : ""}`;
  return (
    <section aria-label="Administrator articles">
      <form
        action="/dashboard/admin/articles"
        method="get"
        className={styles.filters}
      >
        {status === "archived" && from !== "all" && (
          <input type="hidden" name="from" value={from} />
        )}
        <div className={styles.field}>
          <label htmlFor="admin-article-search">Search article titles</label>
          <input
            id="admin-article-search"
            name="search"
            type="search"
            maxLength={80}
            defaultValue={search}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="admin-article-status">Status</label>
          <select id="admin-article-status" name="status" defaultValue={status}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <Button type="submit" className={styles.apply}>
          Apply filters
        </Button>
        <Link className={styles.archives} href={toggleHref} prefetch={false}>
          {status === "archived" ? viewLabel[from] : "View archives"}
        </Link>
      </form>
      {loadFailed ? (
        <p role="alert">
          Unable to load articles. Check the filters and try again.
        </p>
      ) : page.items.length === 0 ? (
        <p className={styles.empty}>No articles match these filters.</p>
      ) : (
        <ul className={styles.rows}>
          {page.items.map((article) => (
            <li key={article.id} className={styles.row}>
              <div className={styles.rowHead}>
                <h2>{article.title}</h2>
              </div>
              <AdminArticleMeta article={article} />
              <ArticleRowActions article={article} admin />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <nav aria-label="Administrator article pages">
          <Link href={`/dashboard/admin/articles?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </section>
  );
}
