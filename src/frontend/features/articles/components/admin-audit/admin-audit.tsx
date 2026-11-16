import Link from "next/link";
import type {
  AuditAction,
  AuditPage,
} from "@/backend/articles/admin-audit/admin-audit";
import styles from "./admin-audit.module.css";

const labels: Record<AuditAction, string> = {
  "article.created": "Created article",
  "article.updated": "Updated article",
  "article.published": "Published article",
  "article.archived": "Archived article",
  "article.restored": "Restored article",
  "article.deleted": "Deleted article",
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
}: {
  page: AuditPage;
  action: AuditAction | null;
}) {
  const next = page.nextCursor
    ? new URLSearchParams({ cursor: page.nextCursor })
    : null;
  if (next && action) next.set("action", action);
  return (
    <section aria-label="Article activity">
      <form
        action="/dashboard/admin/audit"
        method="get"
        className={styles.filter}
      >
        <label htmlFor="audit-action">Action</label>
        <select id="audit-action" name="action" defaultValue={action ?? "all"}>
          <option value="all">All article actions</option>
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length === 0 ? (
        <p>No article activity matches this filter.</p>
      ) : (
        <ol className={styles.events}>
          {page.items.map((event) => (
            <li key={event.id} className={styles.event}>
              <strong>{labels[event.action]}</strong>
              <p>By {event.actorLabel}</p>
              <p>
                <time dateTime={event.createdAt}>
                  {date.format(new Date(event.createdAt))} ET
                </time>
              </p>
              {!event.articleExists ? (
                <p>Deleted article {event.resourceId}</p>
              ) : (
                <Link
                  href={`/dashboard/admin/articles/${event.resourceId}`}
                  prefetch={false}
                >
                  {event.articleTitle
                    ? `View “${event.articleTitle}”`
                    : `View article ${event.resourceId}`}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
      {next && (
        <nav aria-label="Article activity pages">
          <Link href={`/dashboard/admin/audit?${next}`} prefetch={false}>
            Next page
          </Link>
        </nav>
      )}
    </section>
  );
}
