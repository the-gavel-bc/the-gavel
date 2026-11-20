import Link from "next/link";
import type { ReviewItem } from "@/backend/articles/review-queue/review-queue";
import { REVIEW_QUEUE_GROUP_LIMIT } from "@/shared/articles/review-queue/review-queue-limits";
import { StatusBadge } from "../status-badge/status-badge";
import styles from "../article-list/article-list.module.css";

const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

function Rows({ items, verb }: { items: ReviewItem[]; verb: string }) {
  return (
    <ul className={styles.rows}>
      {items.map((item) => (
        <li key={item.id} className={styles.row}>
          <h3>{item.title}</h3>
          <p className={styles.metadata}>
            <StatusBadge
              status={item.status === "draft" ? "inReview" : "published"}
            />
            <span>{item.sectionName}</span>
            <span>By {item.ownerName}</span>
            <span>
              {verb}{" "}
              <time dateTime={item.at}>
                {date.format(new Date(item.at))} ET
              </time>
            </span>
          </p>
          <Link
            href={`/dashboard/articles/${item.id}`}
            prefetch={false}
            aria-label={`${item.status === "draft" ? "Review" : "Open"}: ${item.title}`}
          >
            {item.status === "draft" ? "Review" : "Open"}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const waiting = items.filter((item) => item.status === "draft");
  const published = items.filter((item) => item.status === "published");
  return (
    <>
      <section aria-labelledby="waiting" className={styles.listing}>
        <h2 id="waiting">Waiting for review</h2>
        {waiting.length >= REVIEW_QUEUE_GROUP_LIMIT && (
          <p>
            Showing the oldest submissions, up to {REVIEW_QUEUE_GROUP_LIMIT}.
          </p>
        )}
        {waiting.length === 0 ? (
          <p className={styles.empty}>Nothing is waiting for review.</p>
        ) : (
          <Rows items={waiting} verb="Submitted" />
        )}
      </section>
      <section aria-labelledby="published-by-you" className={styles.listing}>
        <h2 id="published-by-you">Published by you</h2>
        {published.length >= REVIEW_QUEUE_GROUP_LIMIT && (
          <p>
            Showing the latest publications, up to {REVIEW_QUEUE_GROUP_LIMIT}.
          </p>
        )}
        {published.length === 0 ? (
          <p className={styles.empty}>You have not published anything yet.</p>
        ) : (
          <Rows items={published} verb="Published" />
        )}
      </section>
    </>
  );
}
