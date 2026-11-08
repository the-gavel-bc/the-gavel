import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

export const memberStateSchema = z.enum([
  "all",
  "pending",
  "active",
  "inactive",
]);
export type MemberState = z.infer<typeof memberStateSchema>;
export type MemberSummary = {
  userId: string;
  email: string;
  displayName: string | null;
  role: "author" | "administrator" | null;
  state: "pending" | "active" | "inactive";
  version: number | null;
  eligible: boolean;
};
export type MemberPage = { items: MemberSummary[]; nextCursor: string | null };

const pageSchema = z.strictObject({
  state: memberStateSchema.default("all"),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
const rowSchema = z.object({
  user_id: z.custom<string>(isDraftUuid),
  email: z.string().max(255),
  display_name: z.string().min(1).max(120).nullable(),
  role: z.enum(["author", "administrator"]).nullable(),
  state: z.enum(["pending", "active", "inactive"]),
  edit_version: z.number().int().positive().nullable(),
  eligible: z.boolean(),
});
type Cursor = { version: 1; state: MemberState; email: string; id: string };

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
      Object.keys(cursor).length !== 4 ||
      cursor.version !== 1 ||
      !memberStateSchema.safeParse(cursor.state).success ||
      !isDraftUuid(cursor.id) ||
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

export async function listMembers(input: unknown): Promise<MemberPage> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid membership list request.");
  const { state, pageSize } = parsed.data;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor !== undefined && (!cursor || cursor.state !== state))
    throw new Error("Invalid membership list request.");

  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("list_membership_candidates", {
      p_limit: pageSize + 1,
      p_state: state,
      p_before_email: cursor?.email,
      p_before_user_id: cursor?.id,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map((row) => ({
      userId: row.user_id,
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
          ? encodeCursor({
              state,
              email: last.email.toLowerCase(),
              id: last.userId,
            })
          : null,
    };
  } catch {
    throw new Error("Unable to load memberships.");
  }
}
