import Link from "next/link";
import styles from "./reader-states.module.css";
export function ReaderState({
  kind,
  retryHref,
}: {
  kind: "empty" | "unavailable";
  retryHref?: string;
}) {
  return (
    <section
      className={styles.state}
      aria-label={kind === "empty" ? "No articles" : "Articles unavailable"}
    >
      <h2>
        {kind === "empty"
          ? "No articles yet"
          : "Articles are temporarily unavailable"}
      </h2>
      <p>
        {kind === "empty"
          ? "Check back for new stories."
          : "Please try again in a moment."}
      </p>
      {kind === "unavailable" && retryHref && (
        <Link href={retryHref}>Try again</Link>
      )}
    </section>
  );
}
