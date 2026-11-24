import Link from "next/link";
import styles from "./pagination.module.css";
export function ArticlePagination({
  newestHref,
  previousHref,
  nextHref,
  prefetch,
}: {
  /** Back to the first page, shown on later pages. */
  newestHref?: string | null;
  previousHref?: string | null;
  nextHref?: string | null;
  prefetch?: boolean;
}) {
  if (!newestHref && !previousHref && !nextHref) return null;
  return (
    <nav className={styles.pagination} aria-label="Article pages">
      {newestHref && (
        <Link href={newestHref} prefetch={prefetch}>
          Newest articles
        </Link>
      )}
      {previousHref && (
        <Link href={previousHref} rel="prev" prefetch={prefetch}>
          Newer articles
        </Link>
      )}
      {nextHref && (
        <Link href={nextHref} rel="next" prefetch={prefetch}>
          Older articles
        </Link>
      )}
    </nav>
  );
}
