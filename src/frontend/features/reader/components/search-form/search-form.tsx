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
  return (
    <form
      role="search"
      aria-label={navigation ? "Site search" : "Article search"}
      action="/search"
      method="get"
      className={navigation ? styles.navigation : styles.form}
    >
      <label className={navigation ? styles.srOnly : styles.label} htmlFor={id}>
        Search stories
      </label>
      <div className={styles.controls}>
        <input
          id={id}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search stories"
          maxLength={320}
          aria-invalid={invalid || undefined}
          aria-describedby={navigation ? undefined : `${id}-help`}
        />
        <button type="submit">
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
