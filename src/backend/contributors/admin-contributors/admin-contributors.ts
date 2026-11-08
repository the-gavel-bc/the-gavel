import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

export const contributorStateSchema = z.enum(["all", "active", "inactive"]);
export type ContributorState = z.infer<typeof contributorStateSchema>;
export type ContributorSummary = {
  id: string;
  displayName: string;
  slug: string;
  biography: string | null;
  active: boolean;
  version: number;
  slugFrozen: boolean;
  linkedAccount: boolean;
  referencedLive: boolean;
};
export type ContributorPage = {
  items: ContributorSummary[];
  nextCursor: string | null;
};
const inputSchema = z.strictObject({
  state: contributorStateSchema.default("all"),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
const rowSchema = z.object({
  profile_id: z.custom<string>(isDraftUuid),
  display_name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(180),
  biography: z.string().max(5000).nullable(),
  active: z.boolean(),
  edit_version: z.number().int().positive(),
  slug_frozen: z.boolean(),
  linked_account: z.boolean(),
  referenced_live: z.boolean(),
});
type Cursor = { version: 1; state: ContributorState; slug: string; id: string };
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
      !contributorStateSchema.safeParse(cursor.state).success ||
      !rowSchema.shape.slug.safeParse(cursor.slug).success ||
      !isDraftUuid(cursor.id)
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

export async function listAdminContributors(
  input: unknown,
): Promise<ContributorPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid contributor list request.");
  const { state, pageSize } = parsed.data;
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor !== undefined && (!cursor || cursor.state !== state))
    throw new Error("Invalid contributor list request.");
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("list_admin_contributors", {
      p_limit: pageSize + 1,
      p_state: state,
      p_before_slug: cursor?.slug,
      p_before_id: cursor?.id,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    const items = rows.slice(0, pageSize).map((row) => ({
      id: row.profile_id,
      displayName: row.display_name,
      slug: row.slug,
      biography: row.biography,
      active: row.active,
      version: row.edit_version,
      slugFrozen: row.slug_frozen,
      linkedAccount: row.linked_account,
      referencedLive: row.referenced_live,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? Buffer.from(
              JSON.stringify({
                version: 1,
                state,
                slug: last.slug,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  } catch {
    throw new Error("Unable to load contributors.");
  }
}
