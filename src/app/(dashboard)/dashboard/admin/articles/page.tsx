import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getAdminArticlesPage } from "@/backend/articles/admin-article-queries/admin-article-queries";
import { AdminArticleList } from "@/frontend/features/articles/components/admin-articles/admin-article-list";

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Article management</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  const { deleted, from, ...input } = await searchParams;
  let page;
  try {
    page = await getAdminArticlesPage(input);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Article management</h1>
        <p role="alert">
          Unable to load articles. Check the filters or try again.
        </p>
        <Link href="/dashboard/admin/articles" prefetch={false}>
          Reset filters
        </Link>
      </>
    );
  }
  const status =
    typeof input.status === "string" &&
    ["all", "draft", "published", "archived"].includes(input.status)
      ? (input.status as "all" | "draft" | "published" | "archived")
      : "all";
  const search = typeof input.search === "string" ? input.search.trim() : "";
  return (
    <>
      <h1>Article management</h1>
      {deleted === "1" && (
        <p role="status">
          Article deleted. Image cleanup continues and is monitored for late
          uploads.
        </p>
      )}
      <AdminArticleList
        key={`${status}:${search}`}
        page={page}
        status={status}
        search={search}
        from={from === "draft" || from === "published" ? from : "all"}
      />
    </>
  );
}
