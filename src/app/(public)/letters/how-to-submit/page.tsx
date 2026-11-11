import {
  publicPageMetadata,
  excludedMetadata,
} from "@/backend/reader/public-metadata/public-metadata";
import type { Metadata } from "next";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { SiteInformationPage } from "@/frontend/features/reader/components/site-information/site-information";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicSiteNavigationForRequest();
  if (
    result.kind === "unavailable" ||
    !result.information.submissionInstructions?.trim()
  )
    return excludedMetadata("How to submit a letter");
  return publicPageMetadata({
    title: "How to submit a letter",
    path: "/letters/how-to-submit",
    description: result.information.submissionInstructions,
  });
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
