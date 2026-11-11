import type { ReactNode } from "react";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";

export async function PublicReaderShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer: Promise<
    { kind: "ok"; readThis: PublicArticleCard[] } | { kind: "unavailable" }
  >;
}) {
  const [site, result] = await Promise.all([
    getPublicSiteNavigationForRequest(),
    footer,
  ]);
  return (
    <ReaderSurface>
      <PublicShell
        sections={site.kind === "ok" ? site.sections : []}
        information={site.kind === "ok" ? site.information : undefined}
        readThis={result.kind === "ok" ? result.readThis : undefined}
      >
        {site.kind === "unavailable" && (
          <p role="status">
            Navigation is temporarily unavailable. Search and page links are
            still available.
          </p>
        )}
        {children}
      </PublicShell>
    </ReaderSurface>
  );
}
