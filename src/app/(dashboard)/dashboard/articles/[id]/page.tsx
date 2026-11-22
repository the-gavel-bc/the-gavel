import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getDraftEditorData } from "@/backend/articles/draft-queries/draft-queries";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { DraftForm } from "@/frontend/features/articles/components/draft-form/draft-form";
import { getArticleMainImage } from "@/backend/media/media-queries/media-queries";
import { ArticleLifecycleControls } from "@/frontend/features/articles/components/article-lifecycle-controls/article-lifecycle-controls";
export const metadata = { title: "Article details" };

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActiveMembership();
  const { id } = await params;
  if (!isDraftUuid(id)) notFound();
  const recovery = (
    <>
      <h1>Article details</h1>
      <p role="alert">Unable to load this article. Try again.</p>
      <Link href={`/dashboard/articles/${id}`} prefetch={false}>
        Try again
      </Link>
    </>
  );
  let detail;
  let options;
  try {
    ({ detail, options } = await getDraftEditorData(id));
  } catch (error) {
    unstable_rethrow(error);
    return recovery;
  }
  if (detail.kind === "notFound") notFound();
  if (detail.kind === "readOnly")
    return (
      <>
        <h1>Article details</h1>
        <p>This article is {detail.status}. Editing is unavailable.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  if (detail.kind === "viewOnly")
    return (
      <>
        <h1>{detail.title}</h1>
        <p>
          {detail.review.requestedAt
            ? "This article is in review. An editor will publish it or send it back with notes; you cannot edit it until then."
            : detail.status === "published"
              ? "This article is published. Editors and administrators make changes to published articles."
              : "You can read this article but not change it."}
        </p>
        <ArticleLifecycleControls
          key={`${detail.articleId}:${detail.version}`}
          articleId={detail.articleId}
          version={detail.version}
          status={detail.status}
          capabilities={detail.capabilities}
          disabled={false}
        />
        <Link href="/dashboard">My articles</Link>
      </>
    );
  if (detail.kind === "unsupportedContent")
    return (
      <>
        <h1>Article details</h1>
        <p role="alert">
          This article’s body format is unsupported. Its content has been
          preserved; editing is unavailable.
        </p>
        {detail.status === "published" && detail.capabilities.archive && (
          <ArticleLifecycleControls
            key={`${detail.articleId}:${detail.version}`}
            articleId={detail.articleId}
            version={detail.version}
            status="published"
            capabilities={detail.capabilities}
            disabled={false}
          />
        )}
        <Link href="/dashboard">My articles</Link>
      </>
    );
  if (!options) return recovery;
  let mainImage;
  try {
    mainImage = await getArticleMainImage(detail.articleId);
  } catch (error) {
    unstable_rethrow(error);
    return recovery;
  }

  return (
    <>
      <h1>
        {detail.status === "published"
          ? "Edit published article"
          : "Edit draft"}
      </h1>
      <DraftForm
        key={`${detail.articleId}:${detail.status}`}
        initialDraft={detail.draft}
        options={options}
        initialImage={mainImage}
        status={detail.status}
        review={detail.review}
        capabilities={detail.capabilities}
        article={{
          id: detail.articleId,
          version: detail.version,
          updatedAt: detail.updatedAt,
        }}
      />
    </>
  );
}
