"use client";
import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status">Loading your articles…</span> : null;
}
export function ArticlePageLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} prefetch={false}>
      {children}
      <Pending />
    </Link>
  );
}
