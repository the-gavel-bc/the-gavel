import "server-only";

import { cache } from "react";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import {
  isDraftUuid,
  isValidDraftDocument,
  type DraftDocument,
} from "@/shared/articles/draft-contract/draft-contract";

const slug = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const id = z.string().refine(isDraftUuid);
// PostgreSQL char_length counts Unicode code points, not UTF-16 code units.
const text = (max: number, min = 0) =>
  z.string().refine((value) => {
    const length = Array.from(value).length;
    return length >= min && length <= max;
  });
const taxonomy = z.strictObject({
  id,
  name: text(120, 1),
  slug: slug.max(120),
});
const image = {
  id,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
};
const articleSchema = z.strictObject({
  id,
  slug,
  title: text(240, 1),
  excerpt: text(600).nullable(),
  metaDescription: text(320).nullable(),
  publishedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  content: z.custom<DraftDocument>(
    (value) => value !== null && isValidDraftDocument(value),
  ),
  section: taxonomy,
  owner: z.strictObject({
    displayName: text(120, 1),
    slug: slug.nullable(),
    biography: text(5000).nullable(),
    photoUrl: z.string().nullable().optional(),
  }),
  categories: z.array(taxonomy).max(32),
  tags: z.array(taxonomy).max(64),
  contributors: z
    .array(
      z.strictObject({
        displayName: text(120, 1),
        // Credit-only people have no author page, so no slug.
        slug: slug.nullable(),
        role: z.enum(["writer", "editor", "creative"]),
        displayOrder: z.number().int().nonnegative(),
      }),
    )
    .max(32),
  mainImage: z
    .strictObject({
      ...image,
      alt: text(240, 1),
      credit: text(240, 1),
      caption: text(400, 1).nullable(),
    })
    .nullable(),
  bodyImages: z.array(z.strictObject(image)).max(5000),
});
const resultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("notFound") }),
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({ kind: z.literal("ok"), article: articleSchema }),
]);
export type PublicArticle = z.infer<typeof articleSchema>;
export type PublicArticleResult = z.infer<typeof resultSchema>;

export async function getPublicArticle(
  articleSlug: string,
): Promise<PublicArticleResult> {
  if (!slug.safeParse(articleSlug).success) return { kind: "notFound" };
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_article",
      { p_slug: articleSlug },
    );
    if (error) return { kind: "unavailable" };
    const result = resultSchema.safeParse(data);
    if (!result.success) return { kind: "unavailable" };
    if (result.data.kind === "ok") {
      const photoUrl = await ownerPhotoUrl(result.data.article.owner.slug);
      if (photoUrl) result.data.article.owner.photoUrl = photoUrl;
    }
    return result.data;
  } catch {
    return { kind: "unavailable" };
  }
}

// The detail function does not return the photo; a missing one just means no picture.
async function ownerPhotoUrl(ownerSlug: string | null) {
  if (!ownerSlug) return null;
  try {
    const { data } = await createPublicReaderClient()
      .from("profiles")
      .select("photo_updated_at")
      .eq("slug", ownerSlug)
      .eq("active", true)
      .maybeSingle();
    const at = data?.photo_updated_at ? Date.parse(data.photo_updated_at) : NaN;
    return Number.isNaN(at)
      ? null
      : `/api/public/profiles/${ownerSlug}/photo?v=${at}`;
  } catch {
    return null;
  }
}

// Metadata and page reuse one anonymous read within a request, never across requests.
export const getPublicArticleForRequest = cache(getPublicArticle);
