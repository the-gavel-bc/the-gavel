import type { PublicAuthor } from "@/shared/reader/author/author";
import styles from "./author-biography.module.css";
export function AuthorBiography({ author }: { author: PublicAuthor }) {
  if (!author.biography && !author.photoUrl) return null;
  return (
    <section
      aria-label={`About ${author.displayName}`}
      className={styles.biography}
    >
      {author.photoUrl && (
        // Same-origin processed image; next/image is not used under the CSP.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.photo}
          src={author.photoUrl}
          width={96}
          height={96}
          alt={`Photo of ${author.displayName}`}
          decoding="async"
        />
      )}
      <div>
        <h2>Biography</h2>
        {author.biography && <p>{author.biography}</p>}
      </div>
    </section>
  );
}
