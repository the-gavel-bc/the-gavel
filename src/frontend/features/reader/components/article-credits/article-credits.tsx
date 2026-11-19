import Link from "next/link";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
import styles from "./article-credits.module.css";
const roles = [
  ["writer", "Written by"],
  ["editor", "Edited by"],
  ["creative", "Creative contributors"],
] as const;

export function ArticleCredits({ article }: { article: PublicArticle }) {
  return (
    <dl className={styles.credits}>
      {roles.map(([role, label]) => {
        const contributors = article.contributors
          .filter((person) => person.role === role)
          .sort((a, b) => a.displayOrder - b.displayOrder);
        return (
          contributors.length > 0 && (
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
          )
        );
      })}
      {/* Ownership is explicit; it does not invent a writer credit. */}
      <div>
        <dt>Article owner</dt>
        <dd>
          <Link href={`/authors/${article.owner.slug}`}>
            {article.owner.displayName}
          </Link>
        </dd>
      </div>
    </dl>
  );
}
