import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

export const memberStateSchema = z.enum([
  "all",
  "active",
  "inactive",
  "invited",
]);
export type MemberState = z.infer<typeof memberStateSchema>;
export const memberRoleSchema = z.enum(["author", "editor", "administrator"]);
export type MemberSummary = {
  /** Stable row key: the member's user id, or the listing id before sign-in. */
  key: string;
  userId: string | null;
  invitationId: string | null;
  email: string;
  displayName: string | null;
  role: "author" | "editor" | "administrator";
  state: "active" | "inactive" | "invited";
  version: number;
  eligible: boolean;
};
export type MemberPage = { items: MemberSummary[]; nextCursor: string | null };
export type StaffSummary = {
  administrators: number;
  editors: number;
  authors: number;
  invited: number;
  inactive: number;
};
export type MemberFilters = {
  state: MemberState;
  role: z.infer<typeof memberRoleSchema> | null;
  search: string;
};

const pageSchema = z.strictObject({
  state: memberStateSchema.default("all"),
  role: memberRoleSchema.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(25),
});
const rowSchema = z.object({
  key: z.string().min(1).max(64),
  user_id: z.custom<string>(isDraftUuid).nullable(),
  invitation_id: z.custom<string>(isDraftUuid).nullable(),
  email: z.string().max(255),
  display_name: z.string().min(1).max(120).nullable(),
  role: memberRoleSchema,
  state: z.enum(["active", "inactive", "invited"]),
  edit_version: z.number().int().positive(),
  eligible: z.boolean(),
});
type Cursor = { version: 1; email: string; key: string };

function encodeCursor(value: Omit<Cursor, "version">): string {
  return Buffer.from(JSON.stringify({ version: 1, ...value })).toString(
    "base64url",
  );
}

function decodeCursor(value: string): Cursor | null {
  if (!value || value.length > 768 || !/^[A-Za-z0-9_-]+$/u.test(value))
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
      typeof cursor.key !== "string" ||
      cursor.key.length > 64 ||
      typeof cursor.email !== "string" ||
      cursor.email.length > 255 ||
      cursor.email !== cursor.email.toLowerCase()
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

async function requireAdministrator() {
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  return createServerSupabaseClient();
}

export async function listMembers(input: unknown): Promise<MemberPage> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid membership list request.");
  const { state, pageSize, role, q } = parsed.data;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor !== undefined && !cursor)
    throw new Error("Invalid membership list request.");
  const client = await requireAdministrator();
  try {
    const { data, error } = await client.rpc("list_staff", {
      p_limit: pageSize + 1,
      p_state: state,
      p_role: role,
      p_search: q || undefined,
      p_after_email: cursor?.email,
      p_after_key: cursor?.key,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map((row) => ({
      key: row.key,
      userId: row.user_id,
      invitationId: row.invitation_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      state: row.state,
      version: row.edit_version,
      eligible: row.eligible,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? encodeCursor({ email: last.email.toLowerCase(), key: last.key })
          : null,
    };
  } catch {
    throw new Error("Unable to load memberships.");
  }
}

export async function staffSummary(): Promise<StaffSummary> {
  const client = await requireAdministrator();
  const { data, error } = await client.rpc("staff_summary");
  const row = z
    .array(
      z.object({
        administrators: z.number().int(),
        editors: z.number().int(),
        authors: z.number().int(),
        invited: z.number().int(),
        inactive: z.number().int(),
      }),
    )
    .length(1)
    .safeParse(data);
  if (error || !row.success) throw new Error("Unable to load memberships.");
  return row.data[0];
}
