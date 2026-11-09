import type { ReactNode } from "react";
import {
  isDraftUuid,
  isValidDraftDocument,
  type DraftBlock,
  type DraftDocument,
  type DraftInline,
} from "@/shared/articles/draft-contract/draft-contract";

function renderInline(items: DraftInline[] | undefined): ReactNode {
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

function renderBlocks(
  blocks: DraftBlock[],
  articleId: string | undefined,
): ReactNode {
  return blocks.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return <p key={index}>{renderInline(block.content)}</p>;
      case "heading":
        return block.attrs.level === 2 ? (
          <h2 key={index}>{renderInline(block.content)}</h2>
        ) : (
          <h3 key={index}>{renderInline(block.content)}</h3>
        );
      case "blockquote":
        return (
          <blockquote key={index}>
            {renderBlocks(block.content, articleId)}
          </blockquote>
        );
      case "bulletList":
        return (
          <ul key={index}>
            {block.content.map((item, position) => (
              <li key={position}>{renderBlocks(item.content, articleId)}</li>
            ))}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={index} start={block.attrs.start}>
            {block.content.map((item, position) => (
              <li key={position}>{renderBlocks(item.content, articleId)}</li>
            ))}
          </ol>
        );
      case "image":
        return (
          <figure key={index}>
            {articleId && isDraftUuid(articleId) ? (
              // Private, cookie-scoped media cannot pass through the public image optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/articles/${articleId}/media/${block.attrs.assetId}`}
                alt={block.attrs.alt}
              />
            ) : (
              <span>Image: {block.attrs.alt}</span>
            )}
            {block.attrs.caption && (
              <figcaption>{block.attrs.caption}</figcaption>
            )}
          </figure>
        );
    }
  });
}

export function DraftReadOnlyBody({
  content,
  articleId,
}: {
  content: DraftDocument | null;
  articleId?: string;
}) {
  if (!isValidDraftDocument(content))
    return <p>This body cannot be previewed.</p>;
  if (content === null) return <p>No body content yet.</p>;
  return (
    <section aria-label="Read-only article body">
      {renderBlocks(content.document.content, articleId)}
    </section>
  );
}
