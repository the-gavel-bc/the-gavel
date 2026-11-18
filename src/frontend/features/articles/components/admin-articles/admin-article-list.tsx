import Link from "next/link";
import type {
  AdminArticlePage,
  AdminArticleSummary,
} from "@/backend/articles/admin-article-queries/admin-article-queries";
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

export function AdminArticleList({
  page,
  status,
  search,
}: {
  page: AdminArticlePage;
  status: "all" | "draft" | "published" | "archived";
  search: string;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({ cursor: page.nextCursor })
    : null;
  if (next && status !== "all") next.set("status", status);
  if (next && search) next.set("search", search);
  return (
    <section aria-label="Administrator articles">
      <form
        action="/dashboard/admin/articles"
        method="get"
        className={styles.filters}
      >
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
        <button type="submit" className={styles.apply}>
          Apply filters
        </button>
        <Link
          className={styles.archives}
          href="/dashboard/admin/articles?status=archived"
          prefetch={false}
        >
          View archives
        </Link>
      </form>
      {page.items.length === 0 ? (
        <p className={styles.empty}>No articles match these filters.</p>
      ) : (
        <ul className={styles.rows}>
          {page.items.map((article) => (
            <li key={article.id} className={styles.row}>
              <div className={styles.rowHead}>
                <h2>{article.title}</h2>
                <Link
                  className={styles.manage}
                  href={`/dashboard/admin/articles/${article.id}`}
                  prefetch={false}
                  aria-label={`Manage article: ${article.title}`}
                >
                  Manage
                </Link>
              </div>
              <AdminArticleMeta article={article} />
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
