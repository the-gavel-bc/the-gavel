"use client";
import { useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "@/frontend/components/ui/icons/icons";
import { GuardedDashboardLink as Link } from "../guarded-dashboard-link/guarded-dashboard-link";
import { dashboardPages } from "../dashboard-nav/dashboard-nav";
import styles from "./back-link.module.css";

// Nested pages: their own label and the list page each belongs to.
const nested: { pattern: RegExp; label: string; parent: string }[] = [
  {
    pattern: /^\/dashboard\/admin\/articles\/[^/]+$/,
    label: "Article details",
    parent: "/dashboard/admin/articles",
  },
  {
    pattern: /^\/dashboard\/admin\/members\/audit$/,
    label: "Membership history",
    parent: "/dashboard/admin/members",
  },
  {
    pattern: /^\/dashboard\/articles\/new$/,
    label: "New draft",
    parent: "/dashboard",
  },
  {
    pattern: /^\/dashboard\/articles\/[^/]+$/,
    label: "Editor",
    parent: "/dashboard",
  },
];
const nestedFor = (path: string) =>
  nested.find(({ pattern }) => pattern.test(path));
export const labelFor = (path: string) =>
  dashboardPages.find((page) => page.href === path)?.label ??
  nestedFor(path)?.label ??
  null;

// The dashboard URL this tab showed before the current one. A full page load
// starts empty, so the link falls back to the parent list.
let currentUrl: string | null = null;

/**
 * Where "back" goes from `pathname`: the previous dashboard page with its
 * query string (so filters survive) when there is one, else the parent list.
 */
export function backTarget(pathname: string, previous: string | null) {
  const own = nestedFor(pathname);
  if (!own) return null;
  const previousPath = previous?.split("?")[0];
  // A just-created draft is never a useful place to return to.
  if (
    previous &&
    previousPath !== pathname &&
    previousPath !== "/dashboard/articles/new"
  ) {
    const label = labelFor(previousPath!);
    if (label) return { href: previous, label };
  }
  return { href: own.parent, label: labelFor(own.parent)! };
}

/** "← <page>" above nested dashboard pages. */
export function DashboardBackLink() {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  // Read once per page: the effect below has not yet recorded this page.
  const target = useMemo(() => backTarget(pathname, currentUrl), [pathname]);
  useEffect(() => {
    currentUrl = search ? `${pathname}?${search}` : pathname;
  }, [pathname, search]);
  if (!target) return null;
  return (
    <Link
      className={styles.back}
      href={target.href}
      prefetch={false}
      aria-label={`Back to ${target.label}`}
    >
      <ArrowLeftIcon />
      <span>{target.label}</span>
    </Link>
  );
}
