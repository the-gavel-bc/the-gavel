import { contactMailto } from "@/shared/reader/contact-link/contact-link";
import Link from "next/link";
import type { PublicSiteInformation } from "@/shared/reader/site-navigation/site-navigation";
import illustration from "@/frontend/assets/brand/letters-illustration.jpg";
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
  const title = about ? "About The Gavel" : "How to Submit";
  const text = about
    ? information?.mission
    : information?.submissionInstructions;
  // Live-site wording for the letters page.
  const heading = about
    ? "Our mission"
    : "How to Submit to The Gavel’s Letter to the Editor";
  const href = about ? "/about" : "/letters/how-to-submit";
  return (
    <article
      className={about ? styles.page : `${styles.page} ${styles.letters}`}
    >
      {about ? (
        <h1>{title}</h1>
      ) : (
        <>
          <div className={styles.banner}>
            <h1>{title}</h1>
          </div>
          {/* Plain img: next/image adds an inline style the CSP blocks. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.illustration}
            src={illustration.src}
            width={illustration.width}
            height={illustration.height}
            alt="A laptop showing a letter that begins “Dear @BCgavel”"
          />
        </>
      )}
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
          {/* The live letters page carries the email in its instructions only. */}
          {about && (information.contactEmail || information.instagramUrl) && (
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
          {about ? "How to Submit" : "About The Gavel"}
        </Link>
        <Link href="/">Home</Link>
      </nav>
    </article>
  );
}
