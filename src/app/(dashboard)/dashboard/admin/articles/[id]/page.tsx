import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { getAdminArticleDetail } from "@/lib/articles/admin-article-queries/admin-article-queries";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { AdminArticleMeta } from "@/components/dashboard/admin-articles/admin-article-list";
import { GuardedDashboardLink } from "@/components/dashboard/guarded-dashboard-link/guarded-dashboard-link";
import { ArticleDeletion } from "@/components/dashboard/article-deletion/article-deletion";
import { ArticleLifecycleControls } from "@/components/dashboard/article-lifecycle-controls/article-lifecycle-controls";

export default async function AdminArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  if (!isDraftUuid(id)) notFound();
  let article;
  try {
    article = await getAdminArticleDetail(id);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Article management</h1>
        <p role="alert">Unable to load this article. Try again.</p>
        <Link href={`/dashboard/admin/articles/${id}`} prefetch={false}>
          Try again
        </Link>
      </>
    );
  }
  if (!article) notFound();
  return (
    <>
      <h1>{article.title}</h1>
      <AdminArticleMeta article={article} />
      {article.status === "archived" ? (
        <>
          <ArticleLifecycleControls
            key={`${article.id}:${article.version}`}
            articleId={article.id}
            version={article.version}
            status="archived"
            disabled={false}
          />
          <ArticleDeletion articleId={article.id} version={article.version} />
        </>
      ) : (
        <p>
          <Link href={`/dashboard/articles/${article.id}`} prefetch={false}>
            Edit article
          </Link>
        </p>
      )}
      <p>
        <GuardedDashboardLink href="/dashboard/admin/articles">
          Back to article management
        </GuardedDashboardLink>
      </p>
    </>
  );
}
