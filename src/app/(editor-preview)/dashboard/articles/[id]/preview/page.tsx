import { notFound, redirect } from "next/navigation";
import { getEditorialArticlePreview } from "@/backend/articles/article-preview/article-preview";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { excludedMetadata } from "@/backend/reader/public-metadata/public-metadata";
import { ReaderArticleFrame } from "@/frontend/features/reader/components/reader-article-frame/reader-article-frame";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import type { ArticleImageUrl } from "@/shared/reader/reader-article/reader-article";
import { ArrowLeftIcon } from "@/frontend/components/ui/icons/icons";
import styles from "./preview.module.css";

export const dynamic = "force-dynamic";
export const metadata = excludedMetadata("Draft preview");

const privateImageUrl: ArticleImageUrl = (articleId, assetId) =>
  `/api/articles/${articleId}/media/${assetId}`;

export default async function EditorialPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isDraftUuid(id)) notFound();
  const access = await getCurrentAccess().catch(() => null);
  if (access?.status === "signedOut") redirect("/sign-in");
  if (access && (access.status !== "active" || access.role === "author"))
    notFound();
  const result = access
    ? await getEditorialArticlePreview(id)
    : ({ kind: "unavailable" } as const);
  if (result.kind === "notFound") notFound();
  const back = (
    <a href={`/dashboard/articles/${id}`}>
      <ArrowLeftIcon />
      Back to editor
    </a>
  );
  if (result.kind !== "ok")
    return (
      <ReaderSurface>
        <main className={styles.bar}>
          <h1>Draft preview unavailable</h1>
          <p>Try again in a moment.</p>
          {back}
        </main>
      </ReaderSurface>
    );
  return (
    <ReaderSurface>
      <main>
        <ReaderArticleFrame
          article={result.article}
          related={[]}
          imageUrl={privateImageUrl}
          preview={{
            banner: (
              <div className={styles.bar}>
                <strong>Draft preview</strong>
                {result.dateEstimated && (
                  <span>Publication date shown is an estimate.</span>
                )}
                {back}
              </div>
            ),
            bodyUnavailable: result.bodyUnavailable,
            mainImageUnavailable: result.mainImageUnavailable,
          }}
        />
      </main>
    </ReaderSurface>
  );
}
