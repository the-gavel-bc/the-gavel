"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PageSkeleton, type SkeletonKind } from "./page-skeletons";

type Kind = SkeletonKind;
// Typical navigations finish before this, so the skeleton only appears when
// data is genuinely slow to load.
const SHOW_AFTER_MS = 600;
// Clears a skeleton that outlives a stalled or cancelled navigation.
const STALE_AFTER_MS = 8000;

// Which page-shaped skeleton an internal navigation to `url` should show, or null when the
// browser handles it (new tab, download, another origin or the same page).
export function skeletonFor(url: URL, current: URL): Kind | null {
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search)
    return null;
  if (/^\/(dashboard|sign-in|api)(\/|$)/.test(url.pathname)) return null;
  const path = url.pathname;
  if (path === "/") return "home";
  if (path.startsWith("/articles/")) return "article";
  if (path.startsWith("/authors/")) return "author";
  if (path === "/search") return "search";
  if (path === "/about" || path === "/letters/how-to-submit") return "page";
  // Sections, categories, tags and letters share the archive layout.
  return "archive";
}

// Reader routes resolve eligibility before streaming, so they have no route
// loading boundary (that would turn later 404s into 200s). This shows a
// page-shaped skeleton on the client when a followed link takes longer than
// SHOW_AFTER_MS, until the next route renders. Status codes are unaffected.
export function RouteTransition({ children }: { children: ReactNode }) {
  // A navigation is pending until the router delivers new page content
  // (children), including query-only changes such as pagination. This avoids
  // useSearchParams, whose server-side bail-out duplicated every page's HTML.
  const [pending, setPending] = useState<{
    from: ReactNode;
    kind: Kind;
  } | null>(null);
  const [slow, setSlow] = useState<object | null>(null);
  const waiting = pending?.from === children ? pending : null;
  const showing = waiting && slow === waiting ? waiting.kind : null;

  useEffect(() => {
    const start = (target: string) => {
      const kind = skeletonFor(
        new URL(target, location.href),
        new URL(location.href),
      );
      if (kind) setPending({ from: children, kind });
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download")
      )
        return;
      start(link.href);
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.method === "get")
        start(
          `${form.action}?${new URLSearchParams(
            new FormData(form) as unknown as Record<string, string>,
          )}`,
        );
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, [children]);

  useEffect(() => {
    if (!waiting) return;
    const show = setTimeout(() => setSlow(waiting), SHOW_AFTER_MS);
    const stale = setTimeout(() => setPending(null), STALE_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(stale);
    };
  }, [waiting]);

  return (
    <>
      {showing && <PageSkeleton kind={showing} />}
      <div hidden={!!showing}>{children}</div>
    </>
  );
}
