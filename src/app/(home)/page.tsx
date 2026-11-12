import {
  publicPageMetadata,
  excludedMetadata,
} from "@/backend/reader/public-metadata/public-metadata";
import { getPublicHomepageForRequest } from "@/backend/public-homepage/public-homepage";
import { HomeHero } from "@/frontend/features/reader/components/home-hero/home-hero";
import { HomeLatest } from "@/frontend/features/reader/components/home-latest/home-latest";
import { HomeFeatured } from "@/frontend/features/reader/components/home-featured/home-featured";
import { HomeSection } from "@/frontend/features/reader/components/home-section/home-section";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { StayConnected } from "@/frontend/components/site/social-links/social-links";
import { ReaderState } from "@/frontend/features/reader/components/reader-states/reader-states";
import styles from "./page.module.css";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const homepage = await getPublicHomepageForRequest();
  if (homepage.kind === "unavailable") return excludedMetadata("The Gavel");
  const lead = homepage.lead;
  return publicPageMetadata({
    title: "The Gavel",
    path: "/",
    image: lead?.mainImage
      ? { articleId: lead.id, ...lead.mainImage }
      : undefined,
  });
}

export default async function Home() {
  // The shell already reads site navigation for this request; this reuses it.
  const [homepage, site] = await Promise.all([
    getPublicHomepageForRequest(),
    getPublicSiteNavigationForRequest(),
  ]);
  return (
    <div className={styles.main}>
      <h1 className={styles.srOnly}>The Gavel</h1>
      {homepage.kind === "unavailable" ? (
        <ReaderState kind="unavailable" retryHref="/" />
      ) : !homepage.lead &&
        !homepage.featured.length &&
        !homepage.latest.length &&
        !homepage.readThis.length &&
        !homepage.sections.some((section) => section.articles.length) ? (
        <ReaderState kind="empty" />
      ) : (
        <>
          {(homepage.lead || homepage.latest.length > 0) && (
            <div
              className={
                homepage.lead && homepage.latest.length
                  ? styles.heroGrid
                  : styles.heroOnly
              }
            >
              {homepage.lead && <HomeHero article={homepage.lead} />}
              <HomeLatest articles={homepage.latest} />
            </div>
          )}
          <HomeFeatured articles={homepage.featured} />
          {homepage.sections.map((section) => (
            <HomeSection key={section.slug} section={section} />
          ))}
        </>
      )}
      <StayConnected
        information={site.kind === "ok" ? site.information : undefined}
      />
    </div>
  );
}
