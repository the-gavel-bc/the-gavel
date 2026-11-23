import { Button } from "@/frontend/components/ui/button/button";
import { ArticlePageLink } from "../article-page-link/article-page-link";
import { LinkButton } from "@/frontend/components/ui/link-button/link-button";
import type { ArticlePage } from "@/backend/articles/draft-queries/draft-queries";
import { ArticleRowActions } from "../article-row-actions/article-row-actions";
import type { StaffRole } from "@/shared/articles/article-permissions/article-permissions";
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
      <Button type="submit" className={toolbar.apply}>
        Apply filters
      </Button>
    </form>
  );
}

export function ArticleList({
  page,
  status = "all",
  search = "",
  role,
}: {
  page: ArticlePage;
  role?: StaffRole;
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
        <LinkButton
          href="/dashboard/articles/new"
          prefetch={false}
          className={styles.create}
        >
          Create draft
        </LinkButton>
      </div>
      {page.items.length === 0 ? (
        <p className={styles.empty}>
          {filtered
            ? "No articles match these filters."
            : "You have not created any articles yet. Create a draft to get started."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {page.items.map((article) => (
            <li key={article.id} className={styles.row}>
              <h2>{article.title}</h2>
              <p className={styles.metadata}>
                <StatusBadge
                  status={article.inReview ? "inReview" : article.status}
                />
                <span>{article.sectionName}</span>
                <span>
                  Updated{" "}
                  <time dateTime={article.updatedAt}>
                    {date.format(new Date(article.updatedAt))} ET
                  </time>
                </span>
              </p>
              {article.status === "draft" &&
                !article.inReview &&
                article.reviewNote && (
                  <p className={styles.metadata}>
                    Returned by an editor: {article.reviewNote}
                  </p>
                )}
              <ArticleRowActions article={article} admin={false} role={role} />
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
