import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { listPublicArticles } from "../article-list/article-list";
import type {
  PublicArchiveContext,
  PublicArchiveResult,
} from "../public-archive/public-archive";

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const tagSchema = z.strictObject({
  name: z.string().refine((value) => {
    const length = Array.from(value).length;
    return length > 0 && length <= 120;
  }),
  slug: slugSchema,
});

export async function getPublicTagArchive(
  tagSlug: string,
  cursor?: string | string[],
): Promise<PublicArchiveResult> {
  if (!slugSchema.safeParse(tagSlug).success) return { kind: "notFound" };
  try {
    // The anonymous policy exposes labels only for tags with public articles.
    const { data, error } = await createPublicReaderClient()
      .from("tags")
      .select("name,slug")
      .eq("slug", tagSlug)
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    if (data === null) return { kind: "notFound" };
    const tag = tagSchema.safeParse(data);
    if (!tag.success || tag.data.slug !== tagSlug)
      return { kind: "unavailable" };
    const archive: PublicArchiveContext = {
      title: tag.data.name,
      section: null,
      category: null,
      isLetters: false,
      href: `/tags/${tag.data.slug}`,
    };
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 1024)
    )
      return { kind: "invalid", archive };
    const result = await listPublicArticles({
      scope: { kind: "tag", slug: tag.data.slug },
      limit: 12,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (result.kind !== "ok")
      return result.kind === "invalid"
        ? { kind: "invalid", archive }
        : { kind: "unavailable" };
    // The last public association can disappear between the label and list reads.
    if (cursor === undefined && result.items.length === 0)
      return { kind: "notFound" };
    return {
      kind: "ok",
      archive,
      items: result.items,
      nextCursor: result.nextCursor,
      continuation: cursor !== undefined,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

// Share only this request's tag/list snapshot between page and metadata.
export const getPublicTagArchiveForRequest = cache(getPublicTagArchive);
