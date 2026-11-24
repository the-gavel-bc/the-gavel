"use client";
import type { ReactNode } from "react";

// Glides to the top of the page (or jumps, when the reader prefers reduced
// motion), then puts focus on the main content. Without JavaScript the plain
// fragment link still goes to the top.
export function BackToTop({
  href = "#main-content",
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        const reduce = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}
