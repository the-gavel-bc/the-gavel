import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import styles from "./page.module.css";

export default function Home() {
  return (
    <PublicShell>
      <div className={styles.main}>
        <p className={styles.eyebrow}>Independent student journalism</p>
        <h1>The Gavel</h1>
        <p>
          A secure publishing platform for Boston College news, opinions,
          culture, and sports.
        </p>
      </div>
    </PublicShell>
  );
}
