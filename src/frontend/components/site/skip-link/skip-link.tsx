import styles from "./skip-link.module.css";
export function SkipLink() {
  return (
    <a className={styles.link} href="#main-content">
      Skip to content
    </a>
  );
}
