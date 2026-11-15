import Link from "next/link";
import { SearchForm } from "../search-form/search-form";
import styles from "./not-found-recovery.module.css";
export function NotFoundRecovery({
  title = "Page not found",
}: {
  title?: string;
}) {
  return (
    <div className={styles.page}>
      {/* Hoisted into <head>: tabs, history and screen readers name the error. */}
      <title>{`${title} | The Gavel`}</title>
      <h1>{title}</h1>
      <p>
        We couldn’t find that page. Check the address or search for a published
        story.
      </p>
      <SearchForm id="recovery-search-query" />
      <p>
        <Link href="/" prefetch={false}>
          Home
        </Link>
      </p>
    </div>
  );
}
