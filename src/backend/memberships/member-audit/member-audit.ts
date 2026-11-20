import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  isDatabaseTimestamp,
  isDraftUuid,
} from "@/shared/articles/draft-cursor/draft-cursor";
import { staffRoleSchema } from "@/shared/memberships/staff-roles/staff-roles";

const actionSchema = z.enum([
  "membership.approved",
  "membership.role_changed",
  "membership.deactivated",
  "membership.invited",
  "membership.invitation_changed",
  "membership.invitation_removed",
  "membership.claimed",
  "membership.reactivated",
]);
const roleSchema = staffRoleSchema;
const detailSchema = z
  .object({
    role: roleSchema.optional(),
    previousRole: roleSchema.nullable().optional(),
    newRole: roleSchema.optional(),
  })
  .strict()
  .nullable();
const inputSchema = z.strictObject({
  user: z.custom<string>(isDraftUuid).optional(),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export function normalizeMemberAuditSearchParams(
  input: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ["user", "cursor"] as const) {
    const value = input[key];
    if (typeof value === "string") result[key] = value;
    else if (Array.isArray(value))
      result[key] = value.length === 1 && value[0] ? value[0] : "__invalid__";
  }
  return result;
}
const rowSchema = z.object({
  event_id: z.custom<string>(isDraftUuid),
  action: actionSchema,
  resource_id: z.custom<string>(isDraftUuid),
  created_at: z.custom<string>(isDatabaseTimestamp),
  actor_label: z.string().min(1).max(120),
  target_email: z.string().max(255),
  detail: detailSchema,
});
export type MemberAuditEvent = {
  id: string;
  action: z.infer<typeof actionSchema>;
  targetUserId: string;
  targetEmail: string;
  createdAt: string;
  actorLabel: string;
  detail: z.infer<typeof detailSchema>;
};
export type MemberAuditPage = {
  items: MemberAuditEvent[];
  nextCursor: string | null;
};
type Cursor = { version: 1; id: string; createdAt: string };

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
      Object.keys(cursor).length !== 3 ||
      cursor.version !== 1 ||
      !isDraftUuid(cursor.id) ||
      !isDatabaseTimestamp(cursor.createdAt)
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

export async function listMemberAudit(
  input: unknown,
): Promise<MemberAuditPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid membership audit request.");
  const { pageSize } = parsed.data;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor !== undefined && !cursor)
    throw new Error("Invalid membership audit request.");
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc(
      "list_membership_audit_events_v2",
      {
        p_limit: pageSize + 1,
        p_before_at: cursor?.createdAt,
        p_before_id: cursor?.id,
        p_subject: parsed.data.user,
      },
    );
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map((row) => ({
      id: row.event_id,
      action: row.action,
      targetUserId: row.resource_id,
      targetEmail: row.target_email,
      createdAt: row.created_at,
      actorLabel: row.actor_label,
      detail: row.detail,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? Buffer.from(
              JSON.stringify({
                version: 1,
                id: last.id,
                createdAt: last.createdAt,
              }),
            ).toString("base64url")
          : null,
    };
  } catch {
    throw new Error("Unable to load membership activity.");
  }
}
