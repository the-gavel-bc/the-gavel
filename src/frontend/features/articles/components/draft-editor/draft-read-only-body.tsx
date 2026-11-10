import { ArticleBody } from "@/frontend/components/article-body/article-body";
import {
  isDraftUuid,
  type DraftDocument,
} from "@/shared/articles/draft-contract/draft-contract";
export function DraftReadOnlyBody({
  content,
  articleId,
}: {
  content: DraftDocument | null;
  articleId?: string;
}) {
  return (
    <ArticleBody
      content={content}
      label="Read-only article body"
      unavailableMessage="This body cannot be previewed."
      resolveImage={
        articleId && isDraftUuid(articleId)
          ? (assetId) => ({
              src: `/api/articles/${articleId}/media/${assetId}`,
            })
          : undefined
      }
    />
  );
}
