"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { GuardedDashboardLink as Link } from "../guarded-dashboard-link/guarded-dashboard-link";
import styles from "./dashboard-nav.module.css";

const workspace = [
  { href: "/dashboard", label: "My articles", exact: true },
  { href: "/dashboard/profile", label: "Profile" },
];
const review = { href: "/dashboard/review", label: "Review queue" };
const admin = [
  { href: "/dashboard/admin/articles", label: "Administration" },
  { href: "/dashboard/admin/audit", label: "Article activity" },
  { href: "/dashboard/admin/homepage", label: "Homepage" },
  { href: "/dashboard/admin/members", label: "Memberships" },
  { href: "/dashboard/admin/taxonomy", label: "Taxonomy" },
  { href: "/dashboard/admin/site", label: "Site information" },
  { href: "/dashboard/admin/media-cleanup", label: "Media cleanup" },
];

type Item = { href: string; label: string; exact?: boolean };

export function isActive(pathname: string, { href, exact }: Item) {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function Group({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.href}>
          <Link
            className={styles.link}
            href={item.href}
            prefetch={false}
            aria-current={isActive(pathname, item) ? "page" : undefined}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardNav({
  isAdmin,
  canReview = isAdmin,
}: {
  isAdmin: boolean;
  /** Editors and administrators see the review queue. */
  canReview?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const nav = useRef<HTMLElement>(null);
  // Keeps the current page visible in the horizontally scrolling mobile list.
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav ref={nav} className={styles.nav} aria-label="Dashboard navigation">
      <p className={styles.heading} aria-hidden="true">
        Workspace
      </p>
      <Group
        items={
          canReview ? [workspace[0], review, ...workspace.slice(1)] : workspace
        }
        pathname={pathname}
      />
      {isAdmin ? (
        <>
          <p className={styles.heading} aria-hidden="true">
            Admin
          </p>
          <Group items={admin} pathname={pathname} />
        </>
      ) : null}
    </nav>
  );
}
