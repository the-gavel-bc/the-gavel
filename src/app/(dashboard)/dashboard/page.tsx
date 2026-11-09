import { unstable_rethrow } from "next/navigation";
import { ArticleListError } from "@/frontend/features/articles/components/article-list-error/article-list-error";
import { LinkButton } from "@/frontend/components/ui/link-button/link-button";
import Link from "next/link";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getMyArticlesPage } from "@/backend/articles/draft-queries/draft-queries";
import { ArticleList } from "@/frontend/features/articles/components/article-list/article-list";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  await requireActiveMembership();
  const { cursor } = await searchParams;
  let page;
  try {
    if (Array.isArray(cursor)) throw new Error("Invalid article page request.");
    page = await getMyArticlesPage({ cursor });
  } catch (error) {
    unstable_rethrow(error);
    const retryHref =
      typeof cursor === "string"
        ? `/dashboard?${new URLSearchParams({ cursor })}`
        : "/dashboard";
    return (
      <>
        <h1>My articles</h1>
        <ArticleListError>
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
          <Link href="/dashboard" prefetch={false}>
            Newest articles
          </Link>
        </p>
      )}
      <ArticleList page={page} />
    </>
  );
}
