"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./route-transition.module.css";

type Kind = "article" | "list";
// Clears a skeleton that outlives a stalled or cancelled navigation.
const STALE_AFTER_MS = 8000;

// Which skeleton an internal navigation to `url` should show, or null when the
// browser handles it (new tab, download, another origin or the same page).
export function skeletonFor(url: URL, current: URL): Kind | null {
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search)
    return null;
  if (/^\/(dashboard|sign-in|api)(\/|$)/.test(url.pathname)) return null;
  return url.pathname.startsWith("/articles/") ? "article" : "list";
}

// Reader routes resolve eligibility before streaming, so they have no route
// loading boundary (that would turn later 404s into 200s). This shows a
// page-shaped skeleton on the client the moment a reader follows a link,
// until the next route renders. Status codes are unaffected.
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const route = `${pathname}?${search}`;
  const [pending, setPending] = useState<{ from: string; kind: Kind } | null>(
    null,
  );
  const showing = pending?.from === route ? pending.kind : null;

  useEffect(() => {
    const start = (target: string) => {
      const kind = skeletonFor(
        new URL(target, location.href),
        new URL(location.href),
      );
      if (kind) setPending({ from: route, kind });
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
  }, [route]);

  useEffect(() => {
    if (!showing) return;
    const timer = setTimeout(() => setPending(null), STALE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [showing]);

  return (
    <>
      {showing && <PageSkeleton kind={showing} />}
      {/* Keyed by route so each new page replays the entrance fade. */}
      <div key={route} className={styles.page} hidden={!!showing}>
        {children}
      </div>
    </>
  );
}

export function PageSkeleton({ kind }: { kind: Kind }) {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <p role="status" className={styles.srOnly}>
        Loading
      </p>
      {kind === "article" ? (
        <div className={styles.article} aria-hidden="true">
          <span className={`${styles.bone} ${styles.pill}`} />
          <span className={`${styles.bone} ${styles.headline}`} />
          <span
            className={`${styles.bone} ${styles.headline} ${styles.short}`}
          />
          <span className={`${styles.bone} ${styles.line} ${styles.meta}`} />
          <span className={`${styles.bone} ${styles.media}`} />
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={`${styles.bone} ${styles.line}`} />
          ))}
        </div>
      ) : (
        <div aria-hidden="true">
          <span className={`${styles.bone} ${styles.heading}`} />
          <div className={styles.grid}>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className={styles.card}>
                <span className={`${styles.bone} ${styles.media}`} />
                <span className={`${styles.bone} ${styles.pill}`} />
                <span className={`${styles.bone} ${styles.line}`} />
                <span
                  className={`${styles.bone} ${styles.line} ${styles.short}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
