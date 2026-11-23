import { Button } from "@/frontend/components/ui/button/button";
import Link from "next/link";
import type {
  AuditAction,
  AuditPage,
} from "@/backend/articles/admin-audit/admin-audit";
import styles from "./admin-audit.module.css";

const labels: Record<AuditAction, string> = {
  "article.created": "Created",
  "article.updated": "Updated",
  "article.published": "Published",
  "article.archived": "Archived",
  "article.restored": "Restored",
  "article.deleted": "Deleted",
  "article.owner_changed": "Owner changed",
  "article.submitted": "Submitted for review",
  "article.returned": "Returned to author",
  "article.image_purged": "Unused images purged",
};
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  // Staff work in Boston: Eastern time, labelled "ET".
  timeZone: "America/New_York",
});

export function AdminAudit({
  page,
  action,
  search = "",
}: {
  page: AuditPage;
  action: AuditAction | null;
  search?: string;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({ cursor: page.nextCursor })
    : null;
  if (next && action) next.set("action", action);
  if (next && search) next.set("search", search);
  // Every pill keeps the current search, so searching inside an action works.
  const href = (value: string | null) => {
    const query = new URLSearchParams({
      ...(value ? { action: value } : {}),
      ...(search ? { search } : {}),
    });
    return `/dashboard/admin/audit${query.size ? `?${query}` : ""}`;
  };
  return (
    <section aria-label="Article activity" className={styles.activity}>
      <form
        action="/dashboard/admin/audit"
        method="get"
        role="search"
        className={styles.search}
      >
        {action && <input type="hidden" name="action" value={action} />}
        <label>
          <span className={styles.srOnly}>Search activity</span>
          <input
            type="search"
            name="search"
            defaultValue={search}
            maxLength={80}
            placeholder="Search by article, person or date"
          />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <nav aria-label="Filter activity" className={styles.pills}>
        <Link
          href={href(null)}
          prefetch={false}
          aria-current={action === null ? "page" : undefined}
        >
          All
        </Link>
        {Object.entries(labels).map(([value, label]) => (
          <Link
            key={value}
            href={href(value)}
            prefetch={false}
            aria-current={action === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <p className={styles.empty}>
          {search
            ? "No article activity matches this search."
            : "No article activity matches this filter."}
        </p>
      ) : (
        <ol className={styles.events}>
          {page.items.map((event) => (
            <li key={event.id} className={styles.event}>
              <span className={styles.chip} data-action={event.action}>
                {labels[event.action]}
              </span>
              <p className={styles.title}>
                {event.articleExists ? (
                  <Link
                    href={`/dashboard/admin/articles/${event.resourceId}`}
                    prefetch={false}
                  >
                    {event.articleTitle || "Untitled article"}
                  </Link>
                ) : (
                  <span>Deleted article</span>
                )}
              </p>
              <p className={styles.meta}>
                {event.actorLabel} ·{" "}
                <time dateTime={event.createdAt}>
                  {date.format(new Date(event.createdAt))} ET
                </time>
              </p>
            </li>
          ))}
        </ol>
      )}
      {next && (
        <nav aria-label="Article activity pages" className={styles.more}>
          <Link href={`/dashboard/admin/audit?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </section>
  );
}
