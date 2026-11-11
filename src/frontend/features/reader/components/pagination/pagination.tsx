import Link from "next/link";
import styles from "./pagination.module.css";
export function ArticlePagination({
  previousHref,
  nextHref,
  prefetch,
}: {
  previousHref?: string | null;
  nextHref?: string | null;
  prefetch?: boolean;
}) {
  if (!previousHref && !nextHref) return null;
  return (
    <nav className={styles.pagination} aria-label="Article pages">
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
