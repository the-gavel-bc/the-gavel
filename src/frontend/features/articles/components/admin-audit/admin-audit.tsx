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
    <section aria-label="Article activity" className={styles.activity}>
      <nav aria-label="Filter activity" className={styles.pills}>
        <Link
          href="/dashboard/admin/audit"
          prefetch={false}
          aria-current={action === null ? "page" : undefined}
        >
          All
        </Link>
        {Object.entries(labels).map(([value, label]) => (
          <Link
            key={value}
            href={`/dashboard/admin/audit?action=${value}`}
            prefetch={false}
            aria-current={action === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <p className={styles.empty}>No article activity matches this filter.</p>
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
