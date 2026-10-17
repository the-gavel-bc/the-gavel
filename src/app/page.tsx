import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main} id="main-content">
      <p className={styles.eyebrow}>Independent student journalism</p>
      <h1>The Gavel</h1>
      <p>
        A secure publishing platform for Boston College news, opinions, culture,
        and sports.
      </p>
      <Link className={styles.signIn} href="/sign-in">
        Member sign in
      </Link>
    </main>
  );
}
