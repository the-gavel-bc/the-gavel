"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./search-form.module.css";

type Suggestion = { title: string; slug: string; section: string };
type Result =
  | { query: string; kind: "ok"; items: Suggestion[] }
  | { query: string; kind: "error" };
const MIN_LENGTH = 2;
const DEBOUNCE_MS = 300;

// Debounced, abortable lookups; only the newest query's answer is shown.
export function useSearchSuggestions(text: string) {
  const query = text.trim();
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    if (query.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/public/search/suggestions?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const body = await response.json().catch(() => null);
        setResult(
          response.ok && body?.kind === "ok" && Array.isArray(body.items)
            ? { query, kind: "ok", items: body.items }
            : { query, kind: "error" },
        );
      } catch {
        if (!controller.signal.aborted) setResult({ query, kind: "error" });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  if (query.length < MIN_LENGTH) return null;
  return result?.query === query
    ? result
    : ({ query, kind: "loading" } as const);
}

export function SearchSuggestions({
  id,
  state,
  onPick,
}: {
  id: string;
  state: NonNullable<ReturnType<typeof useSearchSuggestions>>;
  onPick: () => void;
}) {
  const all = `/search?q=${encodeURIComponent(state.query)}`;
  return (
    <div id={id} className={styles.suggestions}>
      <p role="status" className={styles.suggestionStatus}>
        {state.kind === "loading"
          ? "Searching…"
          : state.kind === "error"
            ? "Suggestions are unavailable. Press Enter to search."
            : state.items.length
              ? `${state.items.length} ${state.items.length === 1 ? "story" : "stories"}`
              : `No stories match “${state.query}”`}
      </p>
      {state.kind === "ok" && state.items.length > 0 && (
        <ul>
          {state.items.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/articles/${encodeURIComponent(item.slug)}`}
                onClick={onPick}
              >
                <span>{item.title}</span>
                <small>{item.section}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.allResults} href={all} onClick={onPick}>
        See all results
      </Link>
    </div>
  );
}
