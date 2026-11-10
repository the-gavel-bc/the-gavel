import Link from "next/link";
import styles from "./pagination.module.css";
export function ArticlePagination({
  previousHref,
  nextHref,
}: {
  previousHref?: string | null;
  nextHref?: string | null;
}) {
  if (!previousHref && !nextHref) return null;
  return (
    <nav className={styles.pagination} aria-label="Article pages">
      {previousHref && (
        <Link href={previousHref} rel="prev">
          Newer articles
        </Link>
      )}
      {nextHref && (
        <Link href={nextHref} rel="next">
          Older articles
        </Link>
      )}
    </nav>
  );
}
