import Link from "next/link";
import styles from "./page.module.css";
export default function ArticleNotFound() {
  return (
    <div className={styles.page}>
      <h1>Article not found</h1>
      <p>This article is not available.</p>
      <p>
        <Link href="/">Home</Link> · <Link href="/search">Search articles</Link>
      </p>
    </div>
  );
}
