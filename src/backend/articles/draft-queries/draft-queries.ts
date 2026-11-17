import "server-only";

import {
  checkDraftInput,
  isValidDraftDocument,
  type DraftInput,
} from "../../../shared/articles/draft-contract/draft-contract";
import {
  loadDraftOptions,
  type DraftOptions,
} from "../draft-options/draft-options";
import {
  searchSchema,
  statusSchema,
} from "../admin-article-queries/admin-article-queries";
import {
  articleCapabilities,
  type ArticleCapabilities,
} from "../../../shared/articles/article-permissions/article-permissions";
import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  decodeDraftCursor,
  encodeDraftCursor,
  isDatabaseTimestamp,
  isDraftUuid,
} from "../../../shared/articles/draft-cursor/draft-cursor";

export type ArticleSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  sectionId: string;
  sectionName: string;
  version: number;
  updatedAt: string;
  /** Submitted for an editor's review and not yet resolved. */
  inReview: boolean;
  /** The editor's note when the article was last returned. */
  reviewNote: string | null;
};
export type ArticlePage = {
  items: ArticleSummary[];
  nextCursor: string | null;
};
const pageInput = z.strictObject({
  cursor: z.string().optional(),
  // Same filters as Article management. The cursor is not bound to them: the
  // page link carries both, and every row is the caller's own article.
  status: statusSchema.default("all"),
  search: searchSchema.optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
const summaryRow = z.object({
  id: z.custom<string>(isDraftUuid),
  title: z.string().max(240),
  slug: z.string().max(180),
  status: z.enum(["draft", "published", "archived"]),
  section_id: z.custom<string>(isDraftUuid),
  edit_version: z.number().int().min(1).max(2147483647),
  updated_at: z.custom<string>(isDatabaseTimestamp),
});
// The list also names each article's section.
const reviewColumns = {
  review_requested_at: z.custom<string>(isDatabaseTimestamp).nullish(),
  review_note: z.string().max(500).nullish(),
  owner_profile_id: z.custom<string>(isDraftUuid).optional(),
  published_by_profile_id: z.custom<string>(isDraftUuid).nullish(),
};
const listRow = summaryRow.extend({
  section: z.object({ name: z.string().max(160) }),
  review_requested_at: reviewColumns.review_requested_at,
  review_note: reviewColumns.review_note,
});

async function reader() {
  await connection();
  const access = await requireActiveMembership();
  return { access, client: await createServerSupabaseClient() };
}

export async function getMyArticlesPage(input: {
  cursor?: string;
  pageSize?: number;
  status?: string;
  search?: string;
}): Promise<ArticlePage> {
  const parsed = pageInput.safeParse(input);
  const cursor =
    parsed.success && parsed.data.cursor !== undefined
      ? decodeDraftCursor(parsed.data.cursor)
      : null;
  if (!parsed.success || (parsed.data.cursor !== undefined && !cursor))
    throw new Error("Invalid article page request.");
  const { access, client } = await reader();
  try {
    let query = client
      .from("articles")
      .select(
        "id,title,slug,status,section_id,edit_version,updated_at,review_requested_at,review_note,section:sections!articles_section_id_fkey(name)",
      )
      // My Articles stays owner-filtered even for administrators; RLS alone allows more.
      .eq("owner_profile_id", access.profileId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(parsed.data.pageSize + 1);
    if (parsed.data.status !== "all")
      query = query.eq("status", parsed.data.status);
    // searchSchema allows only letters, digits, spaces, ' and -.
    if (parsed.data.search)
      query = query.ilike("title", `%${parsed.data.search}%`);
    if (cursor)
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    const { data, error } = await query;
    if (error) throw error;
    const rows = z
      .array(listRow)
      .max(parsed.data.pageSize + 1)
      .parse(data);
    const items = rows.slice(0, parsed.data.pageSize).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      sectionId: row.section_id,
      sectionName: row.section.name,
      version: row.edit_version,
      updatedAt: row.updated_at,
      inReview: Boolean(row.review_requested_at),
      reviewNote: row.review_note ?? null,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > parsed.data.pageSize && last
          ? encodeDraftCursor(last)
          : null,
    };
  } catch {
    throw new Error("Unable to load articles.");
  }
}

export type ArticleReview = { requestedAt: string | null; note: string | null };
export type DraftDetailResult =
  | {
      kind: "editable";
      status: "draft" | "published";
      articleId: string;
      version: number;
      updatedAt: string;
      review: ArticleReview;
      capabilities: ArticleCapabilities;
      draft: DraftInput;
      unavailableSelections: {
        sectionId: string | null;
        categoryIds: string[];
        tagIds: string[];
        contributorIds: string[];
      };
    }
  | { kind: "readOnly"; status: "archived" }
  // Readable but not editable by this member (for example an author's own
  // article while it waits for review, or an editor's own publication).
  | {
      kind: "viewOnly";
      status: "draft" | "published";
      articleId: string;
      version: number;
      title: string;
      review: ArticleReview;
      capabilities: ArticleCapabilities;
    }
  | {
      kind: "unsupportedContent";
      status: "draft" | "published";
      articleId: string;
      version: number;
      capabilities: ArticleCapabilities;
    }
  | { kind: "notFound" };

export async function getDraftOptions(
  sectionId?: string,
): Promise<DraftOptions> {
  if (sectionId !== undefined && !isDraftUuid(sectionId))
    throw new Error("Invalid section ID.");
  const { client } = await reader();
  return loadDraftOptions(client, sectionId);
}

export type DraftEditorData = {
  detail: DraftDetailResult;
  options: DraftOptions | null;
};

// Compatibility reader retains its existing public result shape.
export async function getDraftDetail(
  articleId: string,
): Promise<DraftDetailResult> {
  return (await getDraftEditorData(articleId)).detail;
}

export async function getDraftEditorData(
  articleId: string,
): Promise<DraftEditorData> {
  if (!isDraftUuid(articleId)) throw new Error("Invalid article ID.");
  const { access, client } = await reader();
  try {
    // Embed associations in the same read so content and edit_version describe one
    // database snapshot. Fetching each relation separately could mix concurrent saves.
    let query = client
      .from("articles")
      .select(
        "id,title,slug,status,section_id,edit_version,updated_at,owner_profile_id,review_requested_at,review_note,published_by_profile_id,excerpt,content,seo_keyphrase,meta_description,article_categories(category_id),article_tags(tag_id),article_contributors(profile_id,contribution_role,display_order)",
      )
      .eq("id", articleId);
    // Authors see only their own articles; editors and administrators rely on
    // the database, which exposes just what their role may read.
    if (access.role === "author")
      query = query.eq("owner_profile_id", access.profileId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return { detail: { kind: "notFound" }, options: null };
    const summary = summaryRow.parse(data);
    const extra = z.object(reviewColumns).parse(data);
    const review: ArticleReview = {
      requestedAt: extra.review_requested_at ?? null,
      note: extra.review_note ?? null,
    };
    const capabilities = articleCapabilities({
      role: access.role,
      isOwner: extra.owner_profile_id === access.profileId,
      status: summary.status,
      inReview: review.requestedAt !== null,
      publishedByMe: extra.published_by_profile_id === access.profileId,
    });
    if (summary.status === "archived")
      return {
        detail: { kind: "readOnly", status: summary.status },
        options: null,
      };
    if (!isValidDraftDocument(data.content))
      return {
        detail: {
          kind: "unsupportedContent",
          status: summary.status,
          articleId: summary.id,
          version: summary.edit_version,
          capabilities,
        },
        options: null,
      };
    if (!capabilities.edit)
      return {
        detail: {
          kind: "viewOnly",
          status: summary.status,
          articleId: summary.id,
          version: summary.edit_version,
          title: summary.title,
          review,
          capabilities,
        },
        options: null,
      };
    const checked = checkDraftInput({
      schemaVersion: 1,
      title: data.title,
      sectionId: data.section_id,
      excerpt: data.excerpt,
      content: data.content,
      seoKeyphrase: data.seo_keyphrase,
      metaDescription: data.meta_description,
      categoryIds: data.article_categories.map((row) => row.category_id),
      tagIds: data.article_tags.map((row) => row.tag_id),
      contributors: data.article_contributors.map((row) => ({
        profileId: row.profile_id,
        role: row.contribution_role,
        displayOrder: row.display_order,
      })),
    });
    if (!checked.ok) throw new Error("Invalid stored draft.");
    const draft = checked.value;
    const options = await loadDraftOptions(client, draft.sectionId);
    const missing = (ids: string[], choices: { id: string }[]) =>
      ids.filter((id) => !choices.some((choice) => choice.id === id));
    const detail: DraftDetailResult = {
      kind: "editable",
      status: summary.status,
      articleId: summary.id,
      version: summary.edit_version,
      updatedAt: summary.updated_at,
      review,
      capabilities,
      draft,
      unavailableSelections: {
        sectionId: options.sections.some(
          (section) => section.id === draft.sectionId,
        )
          ? null
          : draft.sectionId,
        categoryIds: missing(draft.categoryIds, options.categories),
        tagIds: missing(draft.tagIds, options.tags),
        contributorIds: [
          ...new Set(
            missing(
              draft.contributors.map((credit) => credit.profileId),
              options.contributors,
            ),
          ),
        ],
      },
    };
    return { detail, options };
  } catch {
    throw new Error("Unable to load draft.");
  }
}
