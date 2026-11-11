import { contactMailto } from "@/shared/reader/contact-link/contact-link";
import Link from "next/link";
import type { PublicSiteInformation } from "@/shared/reader/site-navigation/site-navigation";
import styles from "./site-information.module.css";
export function SiteInformationPage({
  page,
  information,
}: {
  page: "about" | "submission";
  information: PublicSiteInformation | null;
}) {
  // Null fields are unset copy; a null projection means the read failed.
  const about = page === "about";
  const title = about ? "About The Gavel" : "How to submit a letter";
  const text = about
    ? information?.mission
    : information?.submissionInstructions;
  const heading = about ? "Our mission" : "Submission instructions";
  const href = about ? "/about" : "/letters/how-to-submit";
  return (
    <article className={styles.page}>
      <h1>{title}</h1>
      {information === null ? (
        <section aria-labelledby="information-unavailable">
          <h2 id="information-unavailable">
            Information temporarily unavailable
          </h2>
          <p>Please try again in a moment.</p>
          <Link href={href} prefetch={false}>
            Try again
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="information-copy">
            <h2 id="information-copy">{heading}</h2>
            {text?.trim() ? (
              text
                .split(/\n[\t ]*\n/u)
                .filter((paragraph) => paragraph.trim())
                .map((paragraph, index) => (
                  <p className={styles.prose} key={index}>
                    {paragraph}
                  </p>
                ))
            ) : (
              <p>
                {about
                  ? "Our mission statement is not available yet."
                  : "Submission instructions are not available yet."}
              </p>
            )}
          </section>
          {(information.contactEmail || information.instagramUrl) && (
            <section aria-labelledby="information-contact">
              <h2 id="information-contact">Contact</h2>
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
        </>
      )}
      <nav aria-label="Publication information">
        <Link href={about ? "/letters/how-to-submit" : "/about"}>
          {about ? "How to submit a letter" : "About The Gavel"}
        </Link>
        <Link href="/">Home</Link>
      </nav>
    </article>
  );
}
