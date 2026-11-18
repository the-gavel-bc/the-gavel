"use client";
import { useRef, useState } from "react";
import styles from "./search-form.module.css";
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
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      role="search"
      aria-label={navigation ? "Site search" : "Article search"}
      action="/search"
      method="get"
      className={navigation ? styles.navigation : styles.form}
      data-open={(navigation && open) || undefined}
      onKeyDown={(event) => {
        if (!navigation || event.key !== "Escape" || !open) return;
        setOpen(false);
        input.current?.blur();
      }}
      onBlur={(event) => {
        if (
          navigation &&
          !event.currentTarget.contains(event.relatedTarget) &&
          !input.current?.value
        )
          setOpen(false);
      }}
    >
      <label className={navigation ? styles.srOnly : styles.label} htmlFor={id}>
        Search stories
      </label>
      <div className={styles.controls}>
        <input
          ref={input}
          onFocus={navigation ? () => setOpen(true) : undefined}
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
          type="submit"
          aria-expanded={navigation ? open : undefined}
          aria-controls={navigation ? id : undefined}
          onClick={(event) => {
            if (!navigation || (open && input.current?.value.trim())) return;
            event.preventDefault();
            setOpen(true);
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
