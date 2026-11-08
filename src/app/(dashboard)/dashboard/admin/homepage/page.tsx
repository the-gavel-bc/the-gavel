import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getAdminArticlesPage } from "@/backend/articles/admin-article-queries/admin-article-queries";
import { getAdminHomepageCuration } from "@/backend/homepage/homepage-curation/homepage-curation";
import { HomepageEditor } from "@/components/dashboard/admin-homepage/homepage-editor";
import { GuardedDashboardLink } from "@/components/dashboard/guarded-dashboard-link/guarded-dashboard-link";

const querySchema = z.strictObject({
  search: z.string().optional(),
  cursor: z.string().optional(),
});
export default async function AdminHomepagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Homepage curation</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let curation, candidates;
  const input = await searchParams;
  try {
    const query = querySchema.parse(input);
    [curation, candidates] = await Promise.all([
      getAdminHomepageCuration(),
      getAdminArticlesPage({
        status: "published",
        search: query.search,
        cursor: query.cursor,
      }),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Homepage curation</h1>
        <p role="alert">Unable to load homepage selections or stories.</p>
        <Link href="/dashboard/admin/homepage" prefetch={false}>
          Reset catalog
        </Link>
      </>
    );
  }
  return (
    <>
      <h1>Homepage curation</h1>
      <p>
        <GuardedDashboardLink href="/dashboard/admin/articles">
          Article management
        </GuardedDashboardLink>
      </p>
      <HomepageEditor
        curation={curation}
        candidates={candidates}
        search={typeof input.search === "string" ? input.search.trim() : ""}
        hasCursor={typeof input.cursor === "string"}
      />
    </>
  );
}
