import styles from "./site-header.module.css";
import Link from "next/link";

const sections = [
  ["Features", "/sections/features"],
  ["Opinions", "/sections/opinions"],
  ["Culture", "/sections/culture"],
  ["Sports", "/sections/sports"],
  ["Allston-Brighton", "/sections/allston-brighton"],
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.identity} href="/">
          The Gavel
        </Link>
        <details className={styles.menu}>
          <summary>Sections</summary>
          <nav aria-label="Primary navigation">
            <ul>
              {sections.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
        <Link className={styles.signIn} href="/sign-in">
          Member sign in
        </Link>
      </div>
    </header>
  );
}
