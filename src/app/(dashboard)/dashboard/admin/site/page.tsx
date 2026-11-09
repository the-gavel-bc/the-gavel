import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getSiteInformation } from "@/backend/site-information/site-information/site-information";
import { SiteInformationForm } from "@/frontend/features/site-information/components/admin-site/site-information-form";
export default async function AdminSitePage() {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Site information</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let information;
  try {
    information = await getSiteInformation();
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Site information</h1>
        <p role="alert">Unable to load site information.</p>
        <Link href="/dashboard/admin/site" prefetch={false}>
          Try again
        </Link>
      </>
    );
  }
  return (
    <>
      <h1>Site information</h1>
      <SiteInformationForm information={information} />
    </>
  );
}
