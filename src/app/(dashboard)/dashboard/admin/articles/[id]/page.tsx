import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getAdminArticleDetail } from "@/backend/articles/admin-article-queries/admin-article-queries";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { AdminArticleMeta } from "@/frontend/features/articles/components/admin-articles/admin-article-list";
import { GuardedDashboardLink } from "@/frontend/components/dashboard/guarded-dashboard-link/guarded-dashboard-link";
import { ArticleDeletion } from "@/frontend/features/articles/components/article-deletion/article-deletion";
import { ArticleLifecycleControls } from "@/frontend/features/articles/components/article-lifecycle-controls/article-lifecycle-controls";

export const metadata = { title: "Manage article" };

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
          <ArticleDeletion
            articleId={article.id}
            title={article.title}
            version={article.version}
          />
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
