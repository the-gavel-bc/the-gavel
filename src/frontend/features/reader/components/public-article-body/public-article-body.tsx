import {
  ArticleBody,
  type BodyImage,
} from "@/frontend/components/article-body/article-body";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import {
  publicArticleImageUrl,
  type ArticleImageUrl,
} from "@/shared/reader/reader-article/reader-article";
import styles from "./public-article-body.module.css";

export function PublicArticleBody({
  content,
  articleId,
  images,
  imageUrl = publicArticleImageUrl,
  allowMissingImages = false,
}: {
  content: unknown;
  articleId: string;
  imageUrl?: ArticleImageUrl;
  allowMissingImages?: boolean;
  images: readonly { id: string; width: number; height: number }[];
}) {
  if (
    (!content && !allowMissingImages) ||
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
      src: imageUrl(articleId, image.id),
      width: image.width,
      height: image.height,
    });
  }
  return (
    <div className={styles.prose}>
      <ArticleBody
        content={content}
        allowMissingImages={allowMissingImages}
        resolveImage={(id) => media.get(id.toLowerCase()) ?? null}
      />
    </div>
  );
}
