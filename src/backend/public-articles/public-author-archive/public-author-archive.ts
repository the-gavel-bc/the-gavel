import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { listPublicArticles } from "../article-list/article-list";
import type { PublicAuthor } from "@/shared/reader/author/author";
import type {
  PublicArchiveContext,
  PublicArchiveResult,
} from "../public-archive/public-archive";

const slugSchema = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const profileSchema = z.strictObject({
  display_name: z.string().refine((value) => {
    const length = Array.from(value).length;
    return length > 0 && length <= 120;
  }),
  slug: slugSchema,
  biography: z
    .string()
    .refine((value) => Array.from(value).length <= 5000)
    .nullable(),
});

export type PublicAuthorArchiveResult =
  | Extract<PublicArchiveResult, { kind: "notFound" | "unavailable" }>
  | (Extract<PublicArchiveResult, { kind: "ok" | "invalid" }> & {
      author: PublicAuthor;
    });

export async function getPublicAuthorArchive(
  authorSlug: string,
  cursor?: string | string[],
): Promise<PublicAuthorArchiveResult> {
  if (!slugSchema.safeParse(authorSlug).success) return { kind: "notFound" };
  try {
    // Always use the anonymous active-only policy, even for signed-in owners.
    // Membership and Auth linkage do not belong in a public profile projection.
    const { data, error } = await createPublicReaderClient()
      .from("profiles")
      .select("display_name,slug,biography")
      .eq("slug", authorSlug)
      .eq("active", true)
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    if (data === null) return { kind: "notFound" };
    const profile = profileSchema.safeParse(data);
    if (!profile.success || profile.data.slug !== authorSlug)
      return { kind: "unavailable" };
    const author: PublicAuthor = {
      displayName: profile.data.display_name,
      slug: profile.data.slug,
      biography: profile.data.biography,
    };
    const archive: PublicArchiveContext = {
      title: author.displayName,
      section: null,
      category: null,
      isLetters: false,
      href: `/authors/${author.slug}`,
    };
    if (
      cursor !== undefined &&
      (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 1024)
    )
      return { kind: "invalid", archive, author };
    const result = await listPublicArticles({
      scope: { kind: "author", slug: author.slug },
      limit: 12,
      ...(cursor === undefined ? {} : { cursor }),
    });
    if (result.kind !== "ok")
      return result.kind === "invalid"
        ? { kind: "invalid", archive, author }
        : { kind: "unavailable" };
    return {
      kind: "ok",
      archive,
      author,
      items: result.items,
      nextCursor: result.nextCursor,
      continuation: cursor !== undefined,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

// Share only this request's profile/list snapshot between page and metadata.
export const getPublicAuthorArchiveForRequest = cache(getPublicAuthorArchive);
