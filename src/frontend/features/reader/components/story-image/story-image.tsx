import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import mark from "@/frontend/assets/brand/gavel-mark.png";
import { ReaderImage } from "@/frontend/components/reader-image/reader-image";
import styles from "./story-image.module.css";

// Authorized media route, used directly: image optimization could retain stale
// derivatives after archive. Missing images get a decorative brand tile.
export function StoryImage({
  article,
  eager = false,
  className,
}: {
  article: Pick<PublicArticleCard, "id" | "mainImage">;
  eager?: boolean;
  className?: string;
}) {
  const image = article.mainImage;
  return (
    <div
      className={`${styles.frame} ${image ? styles.loading : ""} ${className ?? ""}`}
    >
      {image ? (
        <ReaderImage
          src={`/api/public/articles/${article.id}/media/${image.id}`}
          alt={image.alt}
          width={image.width}
          height={image.height}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          decoding="async"
        />
      ) : (
        <span className={styles.placeholder}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mark.src} alt="" width={64} height={64} />
        </span>
      )}
    </div>
  );
}
