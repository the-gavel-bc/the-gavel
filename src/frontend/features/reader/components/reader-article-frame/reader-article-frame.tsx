import type { ReactNode } from "react";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import type {
  ArticleImageUrl,
  ReaderArticle,
} from "@/shared/reader/reader-article/reader-article";
import { ArticleContext } from "../article-context/article-context";
import { ArticleCredits } from "../article-credits/article-credits";
import { ArticleHeader } from "../article-header/article-header";
import { PublicArticleBody } from "../public-article-body/public-article-body";
import styles from "./reader-article-frame.module.css";

export function ReaderArticleFrame({
  article,
  related,
  imageUrl,
  preview,
}: {
  article: ReaderArticle;
  related: PublicArticleCard[];
  imageUrl?: ArticleImageUrl;
  preview?: {
    banner: ReactNode;
    bodyUnavailable: boolean;
    mainImageUnavailable: boolean;
  };
}) {
  return (
    <div className={styles.page}>
      {preview ? (
        preview.banner
      ) : (
        <div className={styles.progress} aria-hidden="true" />
      )}
      <article aria-label={article.title} className={styles.article}>
        <ArticleHeader
          article={article}
          imageUrl={imageUrl}
          linkSection={!preview}
        />
        {preview?.mainImageUnavailable && (
          <p>Main image is unavailable in this draft.</p>
        )}
        <ArticleCredits article={article} />
        {preview?.bodyUnavailable ? (
          <p>Draft body is unavailable.</p>
        ) : (
          <PublicArticleBody
            content={article.content}
            articleId={article.id}
            images={article.bodyImages}
            imageUrl={imageUrl}
            allowMissingImages={Boolean(preview)}
          />
        )}
      </article>
      <ArticleContext
        article={article}
        related={related}
        linkTopics={!preview}
      />
    </div>
  );
}
