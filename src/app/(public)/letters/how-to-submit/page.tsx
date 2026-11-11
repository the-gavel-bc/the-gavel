import type { Metadata } from "next";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { SiteInformationPage } from "@/frontend/features/reader/components/site-information/site-information";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicSiteNavigationForRequest();
  return {
    title: "How to submit a letter",
    ...(result.kind === "unavailable" ||
    !result.information.submissionInstructions?.trim()
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
export default async function SubmissionPage() {
  const result = await getPublicSiteNavigationForRequest();
  return (
    <SiteInformationPage
      page="submission"
      information={result.kind === "ok" ? result.information : null}
    />
  );
}
