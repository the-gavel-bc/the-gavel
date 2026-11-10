import Link from "next/link";
import styles from "./archive-grid.module.css";
export function ArchiveNotFound() {
  return (
    <div className={styles.page}>
      <h1>Archive not found</h1>
      <p>This archive is not available.</p>
      <Link href="/">Home</Link>
    </div>
  );
}
