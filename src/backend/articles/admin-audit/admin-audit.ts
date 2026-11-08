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
};
export type AuditPage = { items: AuditEvent[]; nextCursor: string | null };

const inputSchema = z.strictObject({
  action: auditActionSchema.optional(),
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
      Object.keys(cursor).length !== 4 ||
      cursor.version !== 1 ||
      !isDraftUuid(cursor.id) ||
      !isDatabaseTimestamp(cursor.createdAt) ||
      !(
        cursor.action === null ||
        auditActionSchema.safeParse(cursor.action).success
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
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (
    parsed.data.cursor !== undefined &&
    (!cursor || cursor.action !== (action ?? null))
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
      p_before_at: cursor?.createdAt,
      p_before_id: cursor?.id,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map((row) => ({
      id: row.event_id,
      action: row.action,
      resourceId: row.resource_id,
      createdAt: row.created_at,
      actorLabel: row.actor_label,
      articleExists: row.article_exists,
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
            })
          : null,
    };
  } catch {
    throw new Error("Unable to load article activity.");
  }
}
