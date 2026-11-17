import "server-only";
import type { Metadata } from "next";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import type { PublicArticle } from "@/backend/public-articles/public-article/public-article";
import type { PublicArchiveResult } from "@/backend/public-articles/public-archive/public-archive";
import type { PublicAuthorArchiveResult } from "@/backend/public-articles/public-author-archive/public-author-archive";
export const SITE_DESCRIPTION =
  "Independent student journalism at Boston College.";
const plainText = (value: string | null | undefined, max = 320) =>
  Array.from(
    (value ?? "")
      .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, max)
    .join("");
function publicPath(path: string) {
  if (["/", "/about", "/letters", "/letters/how-to-submit"].includes(path))
    return true;
  const parts = path.split("/");
  const slug = (value: string, max: number) =>
    value.length <= max && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
  if (parts[0] !== "") return false;
  if (
    parts.length === 3 &&
    ["articles", "authors", "sections", "tags"].includes(parts[1])
  )
    return slug(
      parts[2],
      ["articles", "authors"].includes(parts[1]) ? 180 : 120,
    );
  return (
    parts.length === 5 &&
    parts[1] === "sections" &&
    parts[3] === "categories" &&
    slug(parts[2], 120) &&
    slug(parts[4], 120)
  );
}
export function excludedMetadata(title: string, follow = false): Metadata {
  // Clear nested fields explicitly so future parent metadata cannot leak previews.
  return {
    title,
    robots: { index: false, follow },
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
  };
}
type Image = {
  articleId: string;
  id: string;
  width: number;
  height: number;
  alt: string;
};
export function publicPageMetadata({
  title,
  path,
  description,
  image,
}: {
  title: string;
  path: string;
  description?: string | null;
  image?: Image;
}): Metadata {
  const heading = plainText(title, 240);
  if (!heading || !publicPath(path))
    return excludedMetadata("Page unavailable");
  const origin = getServerEnv().SITE_URL;
  const canonical = new URL(path, origin).href;
  const summary = plainText(description) || SITE_DESCRIPTION;
  const fullTitle =
    heading === "The Gavel" ? heading : `${heading} | The Gavel`;
  const validImage =
    image &&
    isDraftUuid(image.articleId) &&
    isDraftUuid(image.id) &&
    Number.isInteger(image.width) &&
    image.width > 0 &&
    Number.isInteger(image.height) &&
    image.height > 0;
  const images = validImage
    ? [
        {
          url: new URL(
            `/api/public/articles/${image.articleId}/media/${image.id}`,
            origin,
          ).href,
          width: image.width,
          height: image.height,
          alt: plainText(image.alt, 240),
        },
      ]
    : [];
  return {
    title: heading === "The Gavel" ? { absolute: heading } : heading,
    description: summary,
    robots: { index: true, follow: true },
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: "The Gavel",
      title: fullTitle,
      description: summary,
      url: canonical,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title: fullTitle,
      description: summary,
      images: images.map(({ url, alt }) => ({ url, alt })),
    },
  };
}
export function publicArticleMetadata(article: PublicArticle): Metadata {
  const result = publicPageMetadata({
    title: article.title,
    path: `/articles/${article.slug}`,
    description: plainText(article.metaDescription) || article.excerpt,
    image: article.mainImage
      ? { articleId: article.id, ...article.mainImage }
      : undefined,
  });
  if (!result.openGraph) return result;
  const origin = getServerEnv().SITE_URL;
  const profiles: { displayName: string; slug: string | null }[] = [
    { displayName: article.owner.displayName, slug: article.owner.slug },
    ...article.contributors.filter((person) => person.role === "writer"),
  ];
  const seen = new Set<string>();
  const authors: { name: string; url: string }[] = [];
  for (const person of profiles) {
    if (
      !person.slug ||
      seen.has(person.slug) ||
      !publicPath(`/authors/${person.slug}`)
    )
      continue;
    seen.add(person.slug);
    authors.push({
      name: plainText(person.displayName, 120),
      url: new URL(`/authors/${person.slug}`, origin).href,
    });
  }
  return {
    ...result,
    authors,
    openGraph: {
      ...result.openGraph,
      type: "article",
      publishedTime: article.publishedAt,
      authors: authors.map((author) => author.url),
      section: plainText(article.section.name, 120),
      tags: article.tags.map((tag) => plainText(tag.name, 120)),
    },
  };
}
export function publicArchiveMetadata(
  result: PublicArchiveResult | PublicAuthorArchiveResult,
): Metadata {
  if (result.kind === "notFound") return excludedMetadata("Archive not found");
  if (result.kind === "unavailable")
    return excludedMetadata("Archive temporarily unavailable");
  if (result.kind === "invalid" || result.continuation)
    return excludedMetadata(result.archive.title, result.kind === "ok");
  return publicPageMetadata({
    title: result.archive.title,
    path: result.archive.href,
    description:
      "author" in result
        ? result.author.biography
        : `Published stories from ${result.archive.title}.`,
  });
}
