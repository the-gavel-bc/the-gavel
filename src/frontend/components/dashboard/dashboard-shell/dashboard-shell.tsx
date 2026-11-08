import styles from "./dashboard-shell.module.css";
import { GuardedDashboardLink as Link } from "../guarded-dashboard-link/guarded-dashboard-link";
import type { PropsWithChildren } from "react";
import { SkipLink } from "@/frontend/components/site/skip-link/skip-link";

export interface DashboardShellProps extends PropsWithChildren {
  displayName: string;
  isAdmin: boolean;
}

export function DashboardShell({
  children,
  displayName,
  isAdmin,
}: DashboardShellProps) {
  return (
    <>
      <SkipLink />
      <header className={styles.header}>
        <Link className={styles.identity} href="/">
          The Gavel
        </Link>
        <p>Signed in as {displayName}</p>
      </header>
      <div className={styles.layout}>
        <nav aria-label="Dashboard navigation">
          <ul>
            <li>
              <Link href="/dashboard">My articles</Link>
            </li>
            <li>
              <Link href="/dashboard/profile">Profile</Link>
            </li>
            {isAdmin ? (
              <li>
                <Link href="/dashboard/admin/articles">Administration</Link>
              </li>
            ) : null}
          </ul>
        </nav>
        <main id="main-content">{children}</main>
      </div>
      <footer className={styles.footer}>
        <Link href="/">Return to the public site</Link>
      </footer>
    </>
  );
}
