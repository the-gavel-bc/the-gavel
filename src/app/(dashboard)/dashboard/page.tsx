import { unstable_rethrow } from "next/navigation";
import { ArticleListError } from "@/frontend/features/articles/components/article-list-error/article-list-error";
import { LinkButton } from "@/frontend/components/ui/link-button/link-button";
import Link from "next/link";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getMyArticlesPage } from "@/backend/articles/draft-queries/draft-queries";
import {
  ArticleFilters,
  ArticleList,
} from "@/frontend/features/articles/components/article-list/article-list";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  const { cursor, status: rawStatus, search: rawSearch } = await searchParams;
  const statuses = ["all", "draft", "published", "archived"] as const;
  const status =
    statuses.find((value) => value === rawStatus) ?? ("all" as const);
  const search = typeof rawSearch === "string" ? rawSearch.trim() : "";
  // Filters travel with every page link.
  const filters = new URLSearchParams();
  if (status !== "all") filters.set("status", status);
  if (search) filters.set("search", search);
  const filtered = filters.size > 0;
  const firstPageHref = filtered ? `/dashboard?${filters}` : "/dashboard";
  let page;
  try {
    if (
      Array.isArray(cursor) ||
      Array.isArray(rawStatus) ||
      Array.isArray(rawSearch) ||
      (rawStatus !== undefined && rawStatus !== status)
    )
      throw new Error("Invalid article page request.");
    page = await getMyArticlesPage({
      cursor,
      status,
      ...(search ? { search } : {}),
    });
  } catch (error) {
    unstable_rethrow(error);
    const retry = new URLSearchParams(filters);
    if (typeof cursor === "string") retry.set("cursor", cursor);
    const retryHref = `/dashboard${retry.size ? `?${retry}` : ""}`;
    return (
      <>
        <h1>My articles</h1>
        <ArticleListError newestHref={firstPageHref}>
          <LinkButton href={retryHref} prefetch={false}>
            Try again
          </LinkButton>
        </ArticleListError>
      </>
    );
  }
  return (
    <>
      <h1>My articles</h1>
      {cursor !== undefined && (
        <p>
          <Link href={firstPageHref} prefetch={false}>
            Newest articles
          </Link>
        </p>
      )}
      <ArticleFilters
        key={`filters:${status}:${search}`}
        status={status}
        search={search}
      />
      <ArticleList
        key={`${status}:${search}`}
        role={access.role}
        page={page}
        status={status}
        search={search}
      />
    </>
  );
}
