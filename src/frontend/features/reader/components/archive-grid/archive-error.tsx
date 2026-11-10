"use client";
import Link from "next/link";
import styles from "./archive-grid.module.css";
export function ArchiveError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.page}>
      <h1>Archive temporarily unavailable</h1>
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
