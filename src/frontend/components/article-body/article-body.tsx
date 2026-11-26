import { ReaderImage } from "@/frontend/components/reader-image/reader-image";
import {
  ARTICLE_IMAGE_SIZES,
  publicImageSrcSet,
} from "@/shared/reader/public-image/public-image";
import type { ReactNode } from "react";
import {
  isDraftUuid,
  isValidDraftDocument,
  type DraftBlock,
  type DraftDocument,
  type DraftInline,
} from "@/shared/articles/draft-contract/draft-contract";
import styles from "./article-body.module.css";

export type BodyImage = { src: string; width?: number; height?: number };
function validImage(
  image: BodyImage | null,
  assetId: string,
): image is BodyImage {
  if (!image || typeof image.src !== "string") return false;
  const path = /^\/api\/(?:public\/)?articles\/([^/]+)\/media\/([^/]+)$/u.exec(
    image.src,
  );
  if (
    !path ||
    !isDraftUuid(path[1]) ||
    !isDraftUuid(path[2]) ||
    path[2].toLowerCase() !== assetId.toLowerCase()
  )
    return false;
  if (image.width === undefined && image.height === undefined) return true;
  return (
    Number.isInteger(image.width) &&
    Number.isInteger(image.height) &&
    image.width! > 0 &&
    image.width! <= 6000 &&
    image.height! > 0 &&
    image.height! <= 6000 &&
    image.width! * image.height! <= 24000000
  );
}
function inline(items?: DraftInline[]): ReactNode {
  return items?.map((item, index) => {
    if (item.type === "hardBreak") return <br key={index} />;
    let text: ReactNode = item.text;
    for (const mark of [...(item.marks ?? [])].reverse()) {
      if (mark.type === "link")
        text = (
          <a
            href={mark.attrs.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {text}
          </a>
        );
      else if (mark.type === "bold") text = <strong>{text}</strong>;
      else text = <em>{text}</em>;
    }
    return <span key={index}>{text}</span>;
  });
}
function blocks(
  items: DraftBlock[],
  images: Map<string, BodyImage>,
): ReactNode {
  return items.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return <p key={index}>{inline(block.content)}</p>;
      case "heading":
        return block.attrs.level === 2 ? (
          <h2 key={index}>{inline(block.content)}</h2>
        ) : (
          <h3 key={index}>{inline(block.content)}</h3>
        );
      case "blockquote":
        return (
          <blockquote key={index}>{blocks(block.content, images)}</blockquote>
        );
      case "bulletList":
        return (
          <ul key={index}>
            {block.content.map((item, position) => (
              <li key={position}>{blocks(item.content, images)}</li>
            ))}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={index} start={block.attrs.start}>
            {block.content.map((item, position) => (
              <li key={position}>{blocks(item.content, images)}</li>
            ))}
          </ol>
        );
      case "image": {
        const image = images.get(block.attrs.assetId.toLowerCase());
        return (
          <figure key={index}>
            {image ? (
              // Media routes enforce access/cache lifetime; optimizer derivatives are intentionally avoided.
              <ReaderImage
                src={image.src}
                srcSet={publicImageSrcSet(image.src, image.width)}
                sizes={ARTICLE_IMAGE_SIZES}
                width={image.width}
                height={image.height}
                alt={block.attrs.alt}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span>Image: {block.attrs.alt}</span>
            )}
            {(block.attrs.caption || block.attrs.credit) && (
              <figcaption>
                {block.attrs.caption && (
                  // A caption that repeats the alt text is hidden from screen
                  // readers, which already read the alt text.
                  <span
                    aria-hidden={
                      block.attrs.caption === block.attrs.alt || undefined
                    }
                  >
                    {block.attrs.caption}{" "}
                  </span>
                )}
                {block.attrs.credit && (
                  <span className={styles.credit}>
                    Photo: {block.attrs.credit}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        );
      }
    }
  });
}
function prepare(
  content: unknown,
  resolveImage?: (assetId: string) => BodyImage | null,
  allowMissingImages = false,
):
  | { kind: "invalid" }
  | { kind: "empty" }
  | {
      kind: "ok";
      content: DraftDocument;
      images: Map<string, BodyImage>;
      missingImages: boolean;
    } {
  try {
    if (!isValidDraftDocument(content)) return { kind: "invalid" };
    if (content === null) return { kind: "empty" };
    const images = new Map<string, BodyImage>();
    let missingImages = false;
    // Preflight the whole validated document so unresolved media cannot expose
    // a partially rendered body. Recursion below is bounded by canonical depth.
    const pending = [...content.document.content];
    while (pending.length) {
      const block = pending.pop()!;
      if (block.type === "image" && resolveImage) {
        const resolved = resolveImage(block.attrs.assetId);
        const image = resolved
          ? {
              src: resolved.src,
              width: resolved.width,
              height: resolved.height,
            }
          : null;
        if (!image && allowMissingImages) {
          missingImages = true;
          continue;
        }
        if (!validImage(image, block.attrs.assetId)) return { kind: "invalid" };
        images.set(block.attrs.assetId.toLowerCase(), image);
      } else if (block.type === "blockquote") pending.push(...block.content);
      else if (block.type === "bulletList" || block.type === "orderedList")
        for (const item of block.content) pending.push(...item.content);
    }
    return { kind: "ok", content, images, missingImages };
  } catch {
    return { kind: "invalid" };
  }
}
export function ArticleBody({
  content,
  resolveImage,
  allowMissingImages = false,
  label = "Article body",
  unavailableMessage = "Article content is unavailable.",
}: {
  content: unknown;
  resolveImage?: (assetId: string) => BodyImage | null;
  allowMissingImages?: boolean;
  label?: string;
  unavailableMessage?: string;
}) {
  const prepared = prepare(content, resolveImage, allowMissingImages);
  if (prepared.kind === "invalid") return <p>{unavailableMessage}</p>;
  if (prepared.kind === "empty") return <p>No body content yet.</p>;
  return (
    <section className={styles.body} aria-label={label}>
      {prepared.missingImages && <p>Some draft images are unavailable.</p>}
      {blocks(prepared.content.document.content, prepared.images)}
    </section>
  );
}
