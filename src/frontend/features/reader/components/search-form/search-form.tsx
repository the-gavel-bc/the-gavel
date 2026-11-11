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
        <button type="submit">Search</button>
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
