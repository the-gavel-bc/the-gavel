import "server-only";
import { cache } from "react";
import {
  getPublicSiteNavigationForRequest,
  type PublicSiteNavigation,
} from "@/backend/public-site/public-site-navigation/public-site-navigation";
import { listPublicArticles } from "../article-list/article-list";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";

type Section = Extract<
  PublicSiteNavigation,
  { kind: "ok" }
>["sections"][number];
export type PublicArchiveContext = {
  title: string;
  section: Section;
  category: Section["categories"][number] | null;
  href: string;
  isLetters: boolean;
};
export type PublicArchiveResult =
  | { kind: "notFound" }
  | { kind: "unavailable" }
  | { kind: "invalid"; archive: PublicArchiveContext }
  | {
      kind: "ok";
      archive: PublicArchiveContext;
      items: PublicArticleCard[];
      nextCursor: string | null;
      continuation: boolean;
    };

export async function getPublicArchive(
  kind: "section" | "category" | "letters",
  sectionSlug: string,
  categorySlug: string,
  cursor?: string | string[],
): Promise<PublicArchiveResult> {
  const site = await getPublicSiteNavigationForRequest();
  if (site.kind !== "ok") return { kind: "unavailable" };
  // Taxonomy has no approved stable letters identifier. Resolve the approved
  // label rather than guessing a slug or importing the demo's category model.
  const letters = (section: Section) =>
    section.name.toLowerCase() === "letter to the editor";
  const section =
    kind === "letters"
      ? site.sections.find(letters)
      : site.sections.find((section) => section.slug === sectionSlug);
  if (!section)
    return { kind: kind === "letters" ? "unavailable" : "notFound" };
  const category =
    kind === "category"
      ? section.categories.find((category) => category.slug === categorySlug)
      : null;
  if (kind === "category" && !category) return { kind: "notFound" };
  const href =
    kind === "letters"
      ? "/letters"
      : `/sections/${section.slug}${category ? `/categories/${category.slug}` : ""}`;
  const archive: PublicArchiveContext = {
    title: category?.name ?? section.name,
    section,
    category: category ?? null,
    href,
    isLetters: letters(section),
  };
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 1024)
  )
    return { kind: "invalid", archive };
  const result = await listPublicArticles({
    scope: category
      ? { kind: "category", section: section.slug, category: category.slug }
      : { kind: "section", slug: section.slug },
    limit: 12,
    ...(cursor === undefined ? {} : { cursor }),
  });
  if (result.kind !== "ok")
    return result.kind === "invalid"
      ? { kind: "invalid", archive }
      : { kind: "unavailable" };
  return {
    kind: "ok",
    archive,
    items: result.items,
    nextCursor: result.nextCursor,
    continuation: cursor !== undefined,
  };
}

// Primitive arguments let metadata/page share a request snapshot with React cache.
export const getPublicArchiveForRequest = cache(getPublicArchive);
