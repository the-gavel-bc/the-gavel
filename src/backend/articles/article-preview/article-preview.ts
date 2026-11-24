import "server-only";

import { z } from "zod";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { publicSlugSchema } from "@/backend/public-articles/article-card-schema/article-card-schema";
import { articleCapabilities } from "@/shared/articles/article-permissions/article-permissions";
import {
  isDraftUuid,
  isValidDraftDocument,
} from "@/shared/articles/draft-contract/draft-contract";
import {
  easternToday,
  isCalendarDate,
} from "@/shared/articles/publication-date/publication-date";
import type {
  ReaderArticle,
  ReaderImage,
} from "@/shared/reader/reader-article/reader-article";

const uuid = z.custom<string>(isDraftUuid);
const text = (limit: number) =>
  z.string().refine((value) => Array.from(value).length <= limit);
const taxonomy = z.object({
  id: uuid,
  name: text(120),
  slug: publicSlugSchema,
});
const person = z.object({
  display_name: text(120),
  slug: publicSlugSchema,
  active: z.boolean(),
});
const asset = z
  .object({
    id: uuid,
    article_id: uuid,
    status: z.literal("finalized"),
    width: z.number().int().min(1).max(6000),
    height: z.number().int().min(1).max(6000),
  })
  .refine(({ width, height }) => width * height <= 24_000_000);
const imageLink = z.object({ asset_id: uuid, asset: z.unknown() });
const snapshot = z.object({
  id: uuid,
  title: text(240),
  excerpt: text(600).nullable(),
  owner_profile_id: uuid,
  review_requested_at: z.string().nullable(),
  publication_date: z.string().refine(isCalendarDate).nullable(),
  content: z.unknown(),
  section: taxonomy,
  owner: person.nullable(),
  article_contributors: z
    .array(
      z.object({
        contribution_role: z.enum(["writer", "editor", "creative"]),
        display_order: z.number().int().nonnegative(),
        profile: person.nullable(),
      }),
    )
    .max(32),
  article_categories: z
    .array(
      z.object({
        category: taxonomy.extend({ active: z.boolean() }).nullable(),
      }),
    )
    .max(32),
  article_tags: z.array(z.object({ tag: taxonomy.nullable() })).max(64),
  article_main_images: imageLink
    .extend({
      alt_text: text(240),
      credit: text(240),
      caption: text(400).nullable(),
    })
    .nullable(),
  article_body_images: z.array(imageLink).max(5000),
});

function readImage(
  articleId: string,
  link: z.infer<typeof imageLink>,
): ReaderImage | null {
  const parsed = asset.safeParse(link.asset);
  if (
    !parsed.success ||
    parsed.data.article_id !== articleId ||
    parsed.data.id !== link.asset_id
  )
    return null;
  const { id, width, height } = parsed.data;
  return { id, width, height };
}

async function publicProfiles(slugs: string[]) {
  if (slugs.length === 0) return new Map<string, string | null>();
  try {
    const { data, error } = await createPublicReaderClient()
      .from("profiles")
      .select("slug,biography")
      .in("slug", slugs);
    if (!error) {
      const parsed = z
        .array(
          z.object({
            slug: publicSlugSchema,
            biography: text(5000).nullable(),
          }),
        )
        .max(slugs.length)
        .safeParse(data);
      if (parsed.success)
        return new Map(
          parsed.data.map(({ slug, biography }) => [slug, biography]),
        );
    }
  } catch {
    // Public bio lookup can degrade independently of the authorized article.
  }
  return new Map<string, string | null>();
}

export type EditorialArticlePreview =
  | { kind: "notFound" | "unavailable" }
  | {
      kind: "ok";
      article: ReaderArticle;
      dateEstimated: boolean;
      bodyUnavailable: boolean;
      mainImageUnavailable: boolean;
    };

export async function getEditorialArticlePreview(
  articleId: string,
): Promise<EditorialArticlePreview> {
  if (!isDraftUuid(articleId)) return { kind: "notFound" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role === "author")
      return { kind: "notFound" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client
      .from("articles")
      .select(
        `
      id,title,excerpt,owner_profile_id,review_requested_at,publication_date,content,
      section:sections!articles_section_id_fkey(id,name,slug),
      owner:profiles!articles_owner_profile_id_fkey(display_name,slug,active),
      article_contributors(contribution_role,display_order,profile:profiles(display_name,slug,active)),
      article_categories!article_categories_article_section_fkey(category:categories(id,name,slug,active)),
      article_tags(tag:tags(id,name,slug)),
      article_main_images(alt_text,credit,caption,asset_id,asset:media_assets(id,article_id,status,width,height)),
      article_body_images(asset_id,asset:media_assets(id,article_id,status,width,height))
    `,
      )
      .eq("id", articleId)
      .eq("status", "draft")
      .limit(33, { referencedTable: "article_contributors" })
      .limit(33, { referencedTable: "article_categories" })
      .limit(65, { referencedTable: "article_tags" })
      .limit(5001, { referencedTable: "article_body_images" })
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    if (!data) return { kind: "notFound" };
    const row = snapshot.parse(data);
    if (
      row.id !== articleId.toLowerCase() ||
      !articleCapabilities({
        role: access.role,
        status: "draft",
        inReview: row.review_requested_at !== null,
        isOwner: row.owner_profile_id === access.profileId,
        publishedByMe: false,
      }).edit
    )
      return { kind: "notFound" };
    const people = [
      row.owner,
      ...row.article_contributors.map(({ profile }) => profile),
    ];
    const profiles = await publicProfiles([
      ...new Set(people.flatMap((p) => (p?.active ? [p.slug] : []))),
    ]);
    const label = (p: z.infer<typeof person>) => ({
      displayName: p.display_name,
      slug: p.active && profiles.has(p.slug) ? p.slug : null,
    });
    const owner = row.owner?.active
      ? label(row.owner)
      : { displayName: "Author unavailable", slug: null };
    const main = row.article_main_images;
    const image = main ? readImage(row.id, main) : null;
    const bodyImages = row.article_body_images.flatMap(
      (link) => readImage(row.id, link) ?? [],
    );
    const categories = row.article_categories.flatMap(({ category }) =>
      category?.active
        ? [{ id: category.id, name: category.name, slug: category.slug }]
        : [],
    );
    const tags = row.article_tags.flatMap(({ tag }) => tag ?? []);
    const byTopic = (
      a: z.infer<typeof taxonomy>,
      b: z.infer<typeof taxonomy>,
    ) =>
      a.name.localeCompare(b.name, "en-US") ||
      a.id.localeCompare(b.id, "en-US");
    const contributors = row.article_contributors
      .flatMap(({ profile, contribution_role, display_order }) =>
        profile?.active
          ? [{ profile, role: contribution_role, displayOrder: display_order }]
          : [],
      )
      .sort(
        (a, b) =>
          a.displayOrder - b.displayOrder ||
          a.profile.slug.localeCompare(b.profile.slug, "en-US") ||
          a.role.localeCompare(b.role, "en-US"),
      )
      .map(({ profile, role, displayOrder }) => ({
        ...label(profile),
        role,
        displayOrder,
      }));
    const content = row.content;
    const validBody = isValidDraftDocument(content);
    return {
      kind: "ok",
      dateEstimated: row.publication_date === null,
      bodyUnavailable: !validBody,
      mainImageUnavailable: main !== null && image === null,
      article: {
        id: row.id,
        title: row.title,
        excerpt: row.excerpt,
        publishedAt: `${row.publication_date ?? easternToday()}T12:00:00Z`,
        content: validBody ? content : null,
        section: row.section,
        owner: {
          ...owner,
          biography: owner.slug ? (profiles.get(owner.slug) ?? null) : null,
        },
        contributors,
        categories: categories.sort(byTopic),
        tags: tags.sort(byTopic),
        mainImage:
          main && image
            ? {
                ...image,
                alt: main.alt_text,
                credit: main.credit,
                caption: main.caption,
              }
            : null,
        bodyImages,
      },
    };
  } catch {
    return { kind: "unavailable" };
  }
}
