import Link from "next/link";
import type { ReaderArticle } from "@/shared/reader/reader-article/reader-article";
import styles from "./article-credits.module.css";
// Writers are already in the header byline.
const roles = [
  ["editor", "Edited by"],
  ["creative", "Creative contributors"],
] as const;

export function ArticleCredits({ article }: { article: ReaderArticle }) {
  const credited = roles
    .map(([role, label]) => ({
      role,
      label,
      contributors: article.contributors
        .filter((person) => person.role === role)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    }))
    .filter((group) => group.contributors.length > 0);
  // No editor or creative credits: no block, so no empty bordered box.
  if (credited.length === 0) return null;
  return (
    <dl className={styles.credits}>
      {credited.map(({ role, label, contributors }) => (
        <div key={role}>
          <dt>{label}</dt>
          <dd>
            {contributors.map((person, index) => (
              <span key={`${person.slug ?? person.displayName}:${index}`}>
                {index > 0 && ", "}
                {person.slug ? (
                  <Link href={`/authors/${person.slug}`}>
                    {person.displayName}
                  </Link>
                ) : (
                  person.displayName
                )}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
