import Link from "next/link";
import type { PropsWithChildren } from "react";
import { SkipLink } from "@/components/site/skip-link";

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
      <header className="dashboard-header">
        <Link className="site-identity" href="/">
          The Gavel
        </Link>
        <p>Signed in as {displayName}</p>
      </header>
      <div className="dashboard-layout">
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
      <footer className="dashboard-footer">
        <Link href="/">Return to the public site</Link>
      </footer>
    </>
  );
}
