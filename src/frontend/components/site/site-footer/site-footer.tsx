import { STORY_IMAGE_SIZES } from "@/shared/reader/public-image/public-image";
import { sectionHref } from "@/shared/reader/section-link/section-link";
import { contactMailto } from "@/shared/reader/contact-link/contact-link";
import Link from "next/link";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import type {
  PublicSection,
  PublicSiteInformation,
} from "@/shared/reader/site-navigation/site-navigation";
import { StoryImage } from "@/frontend/features/reader/components/story-image/story-image";
import { BackToTop } from "../back-to-top/back-to-top";
import { MailIcon } from "../site-icons/site-icons";
import { socialLinks } from "../social-links/social-links";
import styles from "./site-footer.module.css";
export function SiteFooter({
  sections = [],
  information,
  readThis = [],
}: {
  sections?: PublicSection[];
  information?: PublicSiteInformation;
  readThis?: Pick<PublicArticleCard, "id" | "slug" | "title" | "mainImage">[];
}) {
  const socials = socialLinks(information);
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">The Gavel</h2>
          <p>Est. 2009</p>
          {information?.mission && (
            <p className={styles.prose}>{information.mission}</p>
          )}
          {(information?.contactEmail || socials.length > 0) && (
            <>
              <h3>Stay Connected</h3>
              {information?.contactEmail && (
                <a
                  className={styles.mail}
                  href={contactMailto(information.contactEmail)}
                >
                  <MailIcon />
                  {information.contactEmail}
                </a>
              )}
              {socials.length > 0 && (
                <ul className={styles.socials}>
                  {socials.map(({ key, label, href, Icon }) => (
                    <li key={key}>
                      <a
                        className={`${styles.social} ${styles[key]}`}
                        href={href}
                        aria-label={label}
                      >
                        <Icon />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        <nav aria-labelledby="footer-links">
          <h2 id="footer-links">Useful Links</h2>
          <ul className={styles.links}>
            <li>
              <Link href="/">Home</Link>
            </li>
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
        {readThis.length > 0 && (
          <section aria-labelledby="footer-read-this">
            <h2 id="footer-read-this">Read This</h2>
            <ul className={styles.readThis}>
              {readThis.map((article) => (
                <li key={article.slug}>
                  <Link
                    className={styles.story}
                    href={`/articles/${encodeURIComponent(article.slug)}`}
                  >
                    <StoryImage
                      sizes={STORY_IMAGE_SIZES.footer}
                      article={article}
                      className={styles.thumb}
                    />
                    <span>{article.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className={styles.bottom}>
        <p>© {new Date().getUTCFullYear()} The Gavel · Boston College</p>
        {/* Without JavaScript any unmatched fragment scrolls to the top. */}
        <BackToTop href="#top">Back to top ↑</BackToTop>
        <Link href="/sign-in">Member sign in</Link>
      </div>
    </footer>
  );
}
