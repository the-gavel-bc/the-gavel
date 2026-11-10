import type { ReactNode } from "react";
import { getPublicSiteNavigation } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { getPublicHomepageForRequest } from "@/backend/public-homepage/public-homepage";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";

export const dynamic = "force-dynamic";
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [site, homepage] = await Promise.all([
    getPublicSiteNavigation(),
    getPublicHomepageForRequest(),
  ]);
  return (
    <ReaderSurface>
      <PublicShell
        sections={site.kind === "ok" ? site.sections : []}
        information={site.kind === "ok" ? site.information : undefined}
        readThis={homepage.kind === "ok" ? homepage.readThis : undefined}
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
