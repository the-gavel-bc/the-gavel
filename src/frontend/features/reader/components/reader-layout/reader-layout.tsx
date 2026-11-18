import type { PropsWithChildren } from "react";
import styles from "./reader-layout.module.css";
export function ReaderSurface({ children }: PropsWithChildren) {
  return (
    <div className={styles.surface} data-reader-surface="">
      {children}
    </div>
  );
}
export function ArticleGrid({ children }: PropsWithChildren) {
  return <div className={styles.grid}>{children}</div>;
}
