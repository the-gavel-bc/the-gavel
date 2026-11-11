import { sectionHref } from "@/shared/reader/section-link/section-link";
import { contactMailto } from "@/shared/reader/contact-link/contact-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import type {
  PublicSection,
  PublicSiteInformation,
} from "@/shared/reader/site-navigation/site-navigation";
import styles from "./site-footer.module.css";
export function SiteFooter({
  sections = [],
  information,
  readThis = [],
}: {
  sections?: PublicSection[];
  information?: PublicSiteInformation;
  readThis?: Pick<PublicArticleCard, "slug" | "title">[];
}) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {information?.mission && (
          <section>
            <h2>About The Gavel</h2>
            <p className={styles.prose}>{information.mission}</p>
          </section>
        )}
        <nav aria-label="Footer navigation">
          <h2>Explore</h2>
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            {sections.map((section) => (
              <li key={section.slug}>
                <Link href={sectionHref(section)}>{section.name}</Link>
              </li>
            ))}
            {information?.submissionInstructions && (
              <li>
                <Link href="/letters/how-to-submit">Submit a letter</Link>
              </li>
            )}
          </ul>
        </nav>
        {(information?.contactEmail || information?.instagramUrl) && (
          <section>
            <h2>Connect</h2>
            <ul>
              {information.contactEmail && (
                <li>
                  <a href={contactMailto(information.contactEmail)}>
                    {information.contactEmail}
                  </a>
                </li>
              )}
              {information.instagramUrl && (
                <li>
                  <a href={information.instagramUrl}>Instagram</a>
                </li>
              )}
            </ul>
          </section>
        )}
        {readThis.length > 0 && (
          <section>
            <h2>Read This</h2>
            <ul>
              {readThis.map((article) => (
                <li key={article.slug}>
                  <Link href={`/articles/${encodeURIComponent(article.slug)}`}>
                    {article.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </footer>
  );
}
