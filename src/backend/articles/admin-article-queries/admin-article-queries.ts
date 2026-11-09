import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  isDatabaseTimestamp,
  isDraftUuid,
} from "../../../shared/articles/draft-cursor/draft-cursor";

const statusSchema = z.enum(["all", "draft", "published", "archived"]);
const searchSchema = z
  .string()
  .trim()
  .max(80)
  .refine((value) => !value || /^[\p{L}\p{N} '\-]+$/u.test(value));
const pageSchema = z.strictObject({
  cursor: z.string().optional(),
  status: statusSchema.default("all"),
  search: searchSchema.optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
type Status = z.infer<typeof statusSchema>;
type Cursor = {
  version: 1;
  id: string;
  updatedAt: string;
  status: Status;
  search: string | null;
};
export type AdminArticleSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  version: number;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  ownerName: string;
  sectionName: string;
};
export type AdminArticlePage = {
  items: AdminArticleSummary[];
  nextCursor: string | null;
};

const rowSchema = z.object({
  id: z.custom<string>(isDraftUuid),
  title: z.string().max(240),
  slug: z.string().max(180),
  status: z.enum(["draft", "published", "archived"]),
  edit_version: z.number().int().min(1).max(2147483647),
  updated_at: z.custom<string>(isDatabaseTimestamp),
  published_at: z.custom<string>(isDatabaseTimestamp).nullable(),
  archived_at: z.custom<string>(isDatabaseTimestamp).nullable(),
  owner: z.object({ display_name: z.string().max(160) }),
  section: z.object({ name: z.string().max(160) }),
});
const projection =
  "id,title,slug,status,edit_version,updated_at,published_at,archived_at,owner:profiles!articles_owner_profile_id_fkey(display_name),section:sections!articles_section_id_fkey(name)";

function summary(row: z.infer<typeof rowSchema>): AdminArticleSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    version: row.edit_version,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    ownerName: row.owner.display_name,
    sectionName: row.section.name,
  };
}

export function encodeAdminArticleCursor(
  value: Omit<Cursor, "version">,
): string {
  if (
    !isDraftUuid(value.id) ||
    !isDatabaseTimestamp(value.updatedAt) ||
    !statusSchema.safeParse(value.status).success ||
    (value.search !== null && !searchSchema.safeParse(value.search).success)
  )
    throw new Error("Invalid admin article cursor.");
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString(
    "base64url",
  );
}

function decodeAdminArticleCursor(value: unknown): Cursor | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 768 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  )
    return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const cursor = parsed as Record<string, unknown>;
    if (
      Object.keys(cursor).length !== 5 ||
      cursor.version !== 1 ||
      !isDraftUuid(cursor.id) ||
      !isDatabaseTimestamp(cursor.updatedAt) ||
      !statusSchema.safeParse(cursor.status).success ||
      !(
        cursor.search === null ||
        (typeof cursor.search === "string" &&
          cursor.search.length > 0 &&
          searchSchema.safeParse(cursor.search).success)
      )
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

async function adminReader() {
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  return createServerSupabaseClient();
}

export async function getAdminArticlesPage(
  input: unknown,
): Promise<AdminArticlePage> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid admin article request.");
  const { status, pageSize } = parsed.data;
  const search = parsed.data.search || null;
  const cursor =
    parsed.data.cursor === undefined
      ? null
      : decodeAdminArticleCursor(parsed.data.cursor);
  if (
    parsed.data.cursor !== undefined &&
    (!cursor || cursor.status !== status || cursor.search !== search)
  )
    throw new Error("Invalid admin article request.");
  const client = await adminReader();
  try {
    let query = client
      .from("articles")
      .select(projection)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize + 1);
    if (status !== "all") query = query.eq("status", status);
    if (search) query = query.ilike("title", `%${search}%`);
    if (cursor)
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    const { data, error } = await query;
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map(summary);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? encodeAdminArticleCursor({
              id: last.id,
              updatedAt: last.updatedAt,
              status,
              search,
            })
          : null,
    };
  } catch {
    throw new Error("Unable to load articles.");
  }
}

export async function getAdminArticleDetail(
  articleId: string,
): Promise<AdminArticleSummary | null> {
  if (!isDraftUuid(articleId)) throw new Error("Invalid article ID.");
  const client = await adminReader();
  try {
    const { data, error } = await client
      .from("articles")
      .select(projection)
      .eq("id", articleId)
      .maybeSingle();
    if (error) throw error;
    return data ? summary(rowSchema.parse(data)) : null;
  } catch {
    throw new Error("Unable to load article.");
  }
}
