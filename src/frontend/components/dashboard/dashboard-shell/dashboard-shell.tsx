import styles from "./dashboard-shell.module.css";
import { GuardedDashboardLink as Link } from "../guarded-dashboard-link/guarded-dashboard-link";
import type { PropsWithChildren, ReactNode } from "react";
import { SkipLink } from "@/frontend/components/site/skip-link/skip-link";
import logo from "@/frontend/assets/brand/gavel-logo.png";
import { DashboardNav } from "../dashboard-nav/dashboard-nav";
import { DashboardBackLink } from "../back-link/back-link";

export interface DashboardShellProps extends PropsWithChildren {
  displayName: string;
  isAdmin: boolean;
  canReview?: boolean;
  accountAction?: ReactNode;
}

export function DashboardShell({
  children,
  displayName,
  isAdmin,
  canReview,
  accountAction,
}: DashboardShellProps) {
  return (
    <div className={styles.surface}>
      <SkipLink />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.identity} href="/">
            {/* Plain img: next/image adds an inline style attribute the CSP blocks. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo.src}
              width={logo.width}
              height={logo.height}
              alt="The Gavel"
            />
          </Link>
          <div className={styles.account}>
            <p>Signed in as {displayName}</p>
            {accountAction}
          </div>
        </div>
      </header>
      <div className={styles.layout}>
        <DashboardNav isAdmin={isAdmin} canReview={canReview} />
        <main id="main-content" className={styles.main}>
          <DashboardBackLink />
          {children}
        </main>
      </div>
      <footer className={styles.footer}>
        <Link href="/">Return to the public site</Link>
      </footer>
    </div>
  );
}
