import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  getAdminArticlesPage,
  searchSchema,
  statusSchema,
} from "@/backend/articles/admin-article-queries/admin-article-queries";
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
  const {
    deleted,
    from,
    cursor,
    status: rawStatus,
    search: rawSearch,
  } = await searchParams;
  const status = statusSchema.safeParse(rawStatus);
  const search = searchSchema.safeParse(rawSearch);
  let page;
  let loadFailed = false;
  try {
    page = await getAdminArticlesPage({
      cursor,
      status: rawStatus,
      search: rawSearch,
    });
  } catch (error) {
    unstable_rethrow(error);
    loadFailed = true;
    page = { items: [], nextCursor: null };
  }
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
        key={`${rawStatus}:${rawSearch}`}
        page={page}
        status={status.data ?? "all"}
        search={search.data ?? ""}
        loadFailed={loadFailed}
        from={from === "draft" || from === "published" ? from : "all"}
      />
    </>
  );
}
