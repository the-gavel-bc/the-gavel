import Link from "next/link";
import type { PublicSection } from "@/shared/reader/site-navigation/site-navigation";
import { ReaderNavigation } from "../reader-navigation/reader-navigation";
import styles from "./site-header.module.css";
export function SiteHeader({ sections = [] }: { sections?: PublicSection[] }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.identity} href="/">
          The Gavel
        </Link>
        <Link className={styles.signIn} href="/sign-in">
          Member sign in
        </Link>
      </div>
      <ReaderNavigation sections={sections} />
    </header>
  );
}
