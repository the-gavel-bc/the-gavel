import type { Metadata } from "next";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { SiteInformationPage } from "@/frontend/features/reader/components/site-information/site-information";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicSiteNavigationForRequest();
  return {
    title: "About The Gavel",
    ...(result.kind === "unavailable" || !result.information.mission?.trim()
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function AboutPage() {
  const result = await getPublicSiteNavigationForRequest();
  return (
    <SiteInformationPage
      page="about"
      information={result.kind === "ok" ? result.information : null}
    />
  );
}
