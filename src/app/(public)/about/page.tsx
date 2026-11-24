import {
  publicPageMetadata,
  excludedMetadata,
} from "@/backend/reader/public-metadata/public-metadata";
import type { Metadata } from "next";
import { getAboutImage } from "@/backend/site-information/about-image/about-image";
import { getPublicSiteNavigationForRequest } from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { SiteInformationPage } from "@/frontend/features/reader/components/site-information/site-information";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicSiteNavigationForRequest();
  if (result.kind === "unavailable" || !result.information.mission?.trim())
    return excludedMetadata("About The Gavel");
  return publicPageMetadata({
    title: "About The Gavel",
    path: "/about",
    description: result.information.mission,
  });
}
export default async function AboutPage() {
  const [result, aboutImage] = await Promise.all([
    getPublicSiteNavigationForRequest(),
    getAboutImage(),
  ]);
  return (
    <SiteInformationPage
      page="about"
      aboutImage={aboutImage}
      information={result.kind === "ok" ? result.information : null}
    />
  );
}
