import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  isDatabaseTimestamp,
  isDraftUuid,
} from "../../../shared/articles/draft-cursor/draft-cursor";

export const auditActionSchema = z.enum([
  "article.created",
  "article.updated",
  "article.published",
  "article.archived",
  "article.restored",
  "article.deleted",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditEvent = {
  id: string;
  action: AuditAction;
  resourceId: string;
  createdAt: string;
  actorLabel: string;
  articleExists: boolean;
  // Current title, when the article still exists and could be read.
  articleTitle: string | null;
};
export type AuditPage = { items: AuditEvent[]; nextCursor: string | null };

export const auditSearchSchema = z
  .string()
  .trim()
  .max(80)
  .refine((value) => !value || /^[\p{L}\p{N} '\-,./]+$/u.test(value));
const inputSchema = z.strictObject({
  action: auditActionSchema.optional(),
  search: auditSearchSchema.optional(),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
const rowSchema = z.object({
  event_id: z.custom<string>(isDraftUuid),
  action: auditActionSchema,
  resource_id: z.custom<string>(isDraftUuid),
  created_at: z.custom<string>(isDatabaseTimestamp),
  actor_label: z.string().min(1).max(120),
  article_exists: z.boolean(),
});
type Cursor = {
  version: 1;
  id: string;
  createdAt: string;
  action: AuditAction | null;
  search: string | null;
};

function encodeCursor(value: Omit<Cursor, "version">): string {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString(
    "base64url",
  );
}

function decodeCursor(value: string): Cursor | null {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value))
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
      !isDatabaseTimestamp(cursor.createdAt) ||
      !(
        cursor.action === null ||
        auditActionSchema.safeParse(cursor.action).success
      ) ||
      !(
        cursor.search === null ||
        (typeof cursor.search === "string" &&
          cursor.search.length > 0 &&
          auditSearchSchema.safeParse(cursor.search).success)
      )
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

export async function listAuditEvents(input: unknown): Promise<AuditPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid audit request.");
  const { action, pageSize } = parsed.data;
  const search = parsed.data.search || null;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (
    parsed.data.cursor !== undefined &&
    (!cursor || cursor.action !== (action ?? null) || cursor.search !== search)
  )
    throw new Error("Invalid audit request.");

  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("list_article_audit_events", {
      p_limit: pageSize + 1,
      p_action: action ?? undefined,
      p_search: search ?? undefined,
      p_before_at: cursor?.createdAt,
      p_before_id: cursor?.id,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    // Titles for the listed articles; administrators may read every article.
    // A failed lookup only loses the titles, not the activity list.
    const ids = [
      ...new Set(
        rows.filter((row) => row.article_exists).map((row) => row.resource_id),
      ),
    ];
    const titles = new Map<string, string>();
    if (ids.length) {
      const found = await client
        .from("articles")
        .select("id, title")
        .in("id", ids);
      for (const article of found.data ?? [])
        titles.set(article.id, article.title);
    }
    const items = rows.slice(0, pageSize).map((row) => ({
      id: row.event_id,
      action: row.action,
      resourceId: row.resource_id,
      createdAt: row.created_at,
      actorLabel: row.actor_label,
      articleExists: row.article_exists,
      articleTitle: titles.get(row.resource_id) ?? null,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({
              id: last.id,
              createdAt: last.createdAt,
              action: action ?? null,
              search,
            })
          : null,
    };
  } catch {
    throw new Error("Unable to load article activity.");
  }
}
