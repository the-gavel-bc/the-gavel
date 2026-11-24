"use server";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";
import { getPublicArchive } from "../public-archive/public-archive";
import { getPublicTagArchive } from "../public-tag-archive/public-tag-archive";
import { getPublicAuthorArchive } from "../public-author-archive/public-author-archive";

export type ArchiveMoreResult =
  | { ok: true; items: PublicArticleCard[]; nextCursor: string | null }
  | { ok: false };

const slug = "[a-z0-9]+(?:-[a-z0-9]+)*";
const routes = {
  section: new RegExp(`^/sections/(${slug})$`, "u"),
  category: new RegExp(`^/sections/(${slug})/categories/(${slug})$`, "u"),
  tag: new RegExp(`^/tags/(${slug})$`, "u"),
  author: new RegExp(`^/authors/(${slug})$`, "u"),
};

// The next page of a public archive, for the "Load more articles" button.
// Reads only what the archive page itself shows at `<href>?cursor=<cursor>`.
export async function loadMoreArchiveArticles(
  href: unknown,
  cursor: unknown,
): Promise<ArchiveMoreResult> {
  if (
    typeof href !== "string" ||
    href.length > 400 ||
    typeof cursor !== "string" ||
    cursor.length < 1 ||
    cursor.length > 1024
  )
    return { ok: false };
  try {
    let match: RegExpExecArray | null;
    const result =
      href === "/letters"
        ? await getPublicArchive("letters", "", "", cursor)
        : (match = routes.category.exec(href))
          ? await getPublicArchive("category", match[1], match[2], cursor)
          : (match = routes.section.exec(href))
            ? await getPublicArchive("section", match[1], "", cursor)
            : (match = routes.tag.exec(href))
              ? await getPublicTagArchive(match[1], cursor)
              : (match = routes.author.exec(href))
                ? await getPublicAuthorArchive(match[1], cursor)
                : null;
    // A section that resolves to another canonical archive (letters) must not
    // serve pages under a second address.
    if (result?.kind !== "ok" || result.archive.href !== href)
      return { ok: false };
    return { ok: true, items: result.items, nextCursor: result.nextCursor };
  } catch {
    return { ok: false };
  }
}
