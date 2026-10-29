"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useDraftLeaveCheck } from "../draft-navigation-guard/draft-navigation-guard";
export function GuardedDashboardLink({
  onNavigate,
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const leave = useDraftLeaveCheck();
  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        if (typeof href === "string" && href.startsWith("#")) {
          onNavigate?.(event);
          return;
        }
        if (!leave()) {
          event.preventDefault();
          return;
        }
        onNavigate?.(event);
      }}
    />
  );
}
