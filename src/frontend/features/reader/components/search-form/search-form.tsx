"use client";
import { useRef, useState } from "react";
import styles from "./search-form.module.css";
import { SearchSuggestions, useSearchSuggestions } from "./search-suggestions";
export function SearchForm({
  id,
  query = "",
  invalid = false,
  navigation = false,
}: {
  id: string;
  query?: string;
  invalid?: boolean;
  navigation?: boolean;
}) {
  // Navigation search collapses to an icon; the first press opens the field.
  // Without JavaScript an empty press submits and lands on the search page.
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(query);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const suggestions = useSearchSuggestions(navigation ? text : "");
  const expand = () => setOpen(true);
  const close = () => {
    setOpen(false);
    setFocused(false);
  };
  const pick = () => {
    close();
    setText("");
    if (input.current) input.current.value = "";
  };
  return (
    <form
      ref={form}
      role="search"
      aria-label={navigation ? "Site search" : "Article search"}
      action="/search"
      method="get"
      className={navigation ? styles.navigation : styles.form}
      data-open={(navigation && open) || undefined}
      onFocus={navigation ? () => setFocused(true) : undefined}
      onKeyDown={(event) => {
        if (!navigation || !open) return;
        if (event.key === "Escape") {
          close();
          // Keep the reader's place: focus goes to the search button, not
          // the page body.
          toggle.current?.focus();
          return;
        }
        // Arrow keys move between the field and the suggestion links.
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const stops = [
          input.current,
          ...event.currentTarget.querySelectorAll<HTMLAnchorElement>(
            `#${id}-suggestions a`,
          ),
        ].filter((stop) => stop !== null) as HTMLElement[];
        const at = stops.indexOf(document.activeElement as HTMLElement);
        const next = stops[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        event.preventDefault();
        next.focus();
      }}
      onBlur={(event) => {
        if (!navigation || event.currentTarget.contains(event.relatedTarget))
          return;
        setFocused(false);
        if (!input.current?.value) setOpen(false);
      }}
    >
      <label className={navigation ? styles.srOnly : styles.label} htmlFor={id}>
        Search stories
      </label>
      <div className={styles.controls}>
        <input
          ref={input}
          onFocus={navigation ? expand : undefined}
          onChange={
            navigation ? (event) => setText(event.target.value) : undefined
          }
          autoComplete={navigation ? "off" : undefined}
          aria-controls={
            navigation && suggestions ? `${id}-suggestions` : undefined
          }
          id={id}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search stories"
          maxLength={320}
          aria-invalid={invalid || undefined}
          aria-describedby={navigation ? undefined : `${id}-help`}
        />
        <button
          ref={toggle}
          type="submit"
          aria-expanded={navigation ? open : undefined}
          aria-controls={navigation ? id : undefined}
          onClick={(event) => {
            if (!navigation || (open && input.current?.value.trim())) return;
            event.preventDefault();
            expand();
            input.current?.focus();
          }}
        >
          {navigation ? (
            <>
              {/* Compact icon button in the navigation band; the name stays "Search". */}
              <svg
                aria-hidden="true"
                focusable="false"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className={styles.srOnly}>Search</span>
            </>
          ) : (
            "Search"
          )}
        </button>
      </div>
      {navigation && open && focused && suggestions && (
        <SearchSuggestions
          id={`${id}-suggestions`}
          state={suggestions}
          onPick={pick}
        />
      )}
      {!navigation && (
        <p id={`${id}-help`} className={styles.help}>
          {invalid
            ? "Check your search words or start again without a page link. "
            : ""}
          Search published stories with a few words, up to 160 characters.
        </p>
      )}
    </form>
  );
}
