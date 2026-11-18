"use client";
import { useEffect, useState, type ReactNode } from "react";
import { PageSkeleton, type SkeletonKind } from "./page-skeletons";

type Kind = SkeletonKind;
// Typical navigations take well under a second (70–190ms measured on a
// production build), so the skeleton is reserved for genuinely slow loads.
const SHOW_AFTER_MS = 1500;
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

// Path and query of the page on screen. The App Router updates the URL in the
// same commit that renders the destination, so a changed URL means the new
// page is visible. (A layout's `children` is a stable router placeholder, so
// it cannot signal arrival; that bug showed skeletons over loaded pages.)
const here = () => location.pathname + location.search;
const SETTLE_POLL_MS = 50;

// Reader routes resolve eligibility before streaming, so they have no route
// loading boundary (that would turn later 404s into 200s). This shows a
// page-shaped skeleton on the client when a followed link takes longer than
// SHOW_AFTER_MS, until the next route renders. Status codes are unaffected.
export function RouteTransition({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ from: string; kind: Kind } | null>(
    null,
  );
  const [shown, setShown] = useState<object | null>(null);
  const showing = pending && shown === pending ? pending.kind : null;

  useEffect(() => {
    const start = (target: string) => {
      const kind = skeletonFor(
        new URL(target, location.href),
        new URL(location.href),
      );
      if (kind) setPending({ from: here(), kind });
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
    // A page restored from the back/forward cache must not resume a skeleton
    // from the full-page navigation that left it.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const settle = () => {
      if (here() !== pending.from) setPending(null);
    };
    // ponytail: polls the URL every 50ms while a navigation is pending; the
    // Navigation API's currententrychange can replace it once widely shipped.
    const poll = setInterval(settle, SETTLE_POLL_MS);
    const show = setTimeout(() => {
      if (here() === pending.from) setShown(pending);
    }, SHOW_AFTER_MS);
    const stale = setTimeout(() => setPending(null), STALE_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(show);
      clearTimeout(stale);
    };
  }, [pending]);

  return (
    <>
      {showing && <PageSkeleton kind={showing} />}
      <div hidden={!!showing}>{children}</div>
    </>
  );
}
