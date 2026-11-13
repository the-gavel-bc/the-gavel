import styles from "./public-shell.module.css";
import { Suspense, type PropsWithChildren } from "react";
import { RouteTransition } from "@/frontend/features/reader/components/route-transition/route-transition";
import { SiteFooter } from "../site-footer/site-footer";
import { SiteHeader } from "../site-header/site-header";
import { SkipLink } from "../skip-link/skip-link";
import type {
  PublicSection,
  PublicSiteInformation,
} from "@/shared/reader/site-navigation/site-navigation";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";

export function PublicShell({
  children,
  sections = [],
  information,
  readThis,
}: PropsWithChildren<{
  sections?: PublicSection[];
  information?: PublicSiteInformation;
  readThis?: Pick<PublicArticleCard, "id" | "slug" | "title" | "mainImage">[];
}>) {
  return (
    <>
      <SkipLink />
      <SiteHeader sections={sections} />
      <main className={styles.main} id="main-content" tabIndex={-1}>
        {/* Search params need a Suspense boundary; the fallback is the page itself. */}
        <Suspense fallback={children}>
          <RouteTransition>{children}</RouteTransition>
        </Suspense>
      </main>
      <SiteFooter
        sections={sections}
        information={information}
        readThis={readThis}
      />
    </>
  );
}
