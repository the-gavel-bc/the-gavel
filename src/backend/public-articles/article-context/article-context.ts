import "server-only";
import { listPublicArticles } from "../article-list/article-list";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";

export async function getArticleContext(
  articleId: string,
  sectionSlug: string,
): Promise<PublicArticleCard[]> {
  const selected = new Map<string, PublicArticleCard>();
  const add = (items: PublicArticleCard[]) => {
    for (const item of items) {
      if (item.id !== articleId && !selected.has(item.id) && selected.size < 3)
        selected.set(item.id, item);
    }
  };
  // Four candidates allow exclusion of the current story without an unbounded scan.
  const section = await listPublicArticles({
    scope: { kind: "section", slug: sectionSlug },
    limit: 4,
  });
  if (section.kind === "ok") add(section.items);
  if (selected.size < 3) {
    const recent = await listPublicArticles({
      scope: { kind: "latest" },
      limit: 4,
    });
    if (recent.kind === "ok") add(recent.items);
  }
  return [...selected.values()];
}
