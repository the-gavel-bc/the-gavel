import styles from "./public-shell.module.css";
import type { PropsWithChildren } from "react";
import { SiteFooter } from "../site-footer/site-footer";
import { SiteHeader } from "../site-header/site-header";
import { SkipLink } from "../skip-link/skip-link";

export function PublicShell({ children }: PropsWithChildren) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main className={styles.main} id="main-content">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
