import type { ReactNode } from "react";
import { getPublicSiteNavigation } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";

export const dynamic = "force-dynamic";
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const site = await getPublicSiteNavigation();
  return (
    <ReaderSurface>
      <PublicShell
        sections={site.kind === "ok" ? site.sections : []}
        information={site.kind === "ok" ? site.information : undefined}
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
