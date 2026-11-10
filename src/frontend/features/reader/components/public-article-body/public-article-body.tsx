import {
  ArticleBody,
  type BodyImage,
} from "@/frontend/components/article-body/article-body";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import styles from "./public-article-body.module.css";

export function PublicArticleBody({
  content,
  articleId,
  images,
}: {
  content: unknown;
  articleId: string;
  images: readonly { id: string; width: number; height: number }[];
}) {
  if (
    !content ||
    !isDraftUuid(articleId) ||
    !Array.isArray(images) ||
    images.length > 5000
  )
    return <p>Article content is unavailable.</p>;
  const media = new Map<string, BodyImage>();
  for (const image of images) {
    if (
      !image ||
      !isDraftUuid(image.id) ||
      media.has(image.id.toLowerCase()) ||
      !Number.isInteger(image.width) ||
      !Number.isInteger(image.height) ||
      image.width < 1 ||
      image.width > 6000 ||
      image.height < 1 ||
      image.height > 6000 ||
      image.width * image.height > 24000000
    )
      return <p>Article content is unavailable.</p>;
    media.set(image.id.toLowerCase(), {
      src: `/api/public/articles/${articleId.toLowerCase()}/media/${image.id.toLowerCase()}`,
      width: image.width,
      height: image.height,
    });
  }
  return (
    <div className={styles.prose}>
      <ArticleBody
        content={content}
        resolveImage={(id) => media.get(id.toLowerCase()) ?? null}
      />
    </div>
  );
}
