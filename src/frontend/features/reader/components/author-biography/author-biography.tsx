import type { PublicAuthor } from "@/shared/reader/author/author";
import styles from "./author-biography.module.css";
export function AuthorBiography({ author }: { author: PublicAuthor }) {
  if (!author.biography) return null;
  return (
    <section
      aria-label={`About ${author.displayName}`}
      className={styles.biography}
    >
      <h2>Biography</h2>
      <p>{author.biography}</p>
    </section>
  );
}
