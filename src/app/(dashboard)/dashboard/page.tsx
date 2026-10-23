import Link from "next/link";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { getMyArticlesPage } from "@/lib/articles/draft-queries/draft-queries";
import { ArticleList } from "@/components/dashboard/article-list/article-list";
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  await requireActiveMembership();
  const { cursor } = await searchParams;
  if (Array.isArray(cursor)) throw new Error("Invalid article page request.");
  const page = await getMyArticlesPage({ cursor });
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
