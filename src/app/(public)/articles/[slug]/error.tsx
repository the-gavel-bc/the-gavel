"use client";
import Link from "next/link";
import styles from "./page.module.css";
export default function ArticleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.page}>
      <h1>Article temporarily unavailable</h1>
      <p>Please try again in a moment.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
      <p>
        <Link href="/">Home</Link>
      </p>
    </div>
  );
}
