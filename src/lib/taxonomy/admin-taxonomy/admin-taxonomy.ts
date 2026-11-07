import { connection } from "next/server";
import { z } from "zod";
import { isDraftUuid } from "@/lib/articles/draft-cursor/draft-cursor";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";

export const taxonomyKindSchema = z.enum(["section", "category", "tag"]);
export type TaxonomyKind = z.infer<typeof taxonomyKindSchema>;
export type TaxonomyItem = {
  id: string;
  name: string;
  slug: string;
  parentName: string | null;
  navigationOrder: number | null;
  active: boolean | null;
  version: number | null;
  referencedLive: boolean;
};
export type TaxonomyPage = { items: TaxonomyItem[]; nextCursor: string | null };
const uuid = z.custom<string>(isDraftUuid);
const inputSchema = z.strictObject({
  kind: taxonomyKindSchema.default("section"),
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
});
const rowSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  parent_name: z.string().max(120).nullable(),
  navigation_order: z.number().int().nonnegative().nullable(),
  active: z.boolean().nullable(),
  edit_version: z.number().int().positive().nullable(),
  referenced_live: z.boolean(),
});
function decodeCursor(value: string, kind: TaxonomyKind): string | null {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value))
    return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const cursor = parsed as Record<string, unknown>;
    return Object.keys(cursor).length === 3 &&
      cursor.version === 1 &&
      cursor.kind === kind &&
      isDraftUuid(cursor.id)
      ? cursor.id
      : null;
  } catch {
    return null;
  }
}
export async function listAdminTaxonomy(input: unknown): Promise<TaxonomyPage> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid taxonomy list request.");
  const { kind, pageSize } = parsed.data;
  const cursor = parsed.data.cursor
    ? decodeCursor(parsed.data.cursor, kind)
    : null;
  if (parsed.data.cursor !== undefined && !cursor)
    throw new Error("Invalid taxonomy list request.");
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("list_admin_taxonomy", {
      p_kind: kind,
      p_limit: pageSize + 1,
      p_after_id: cursor ?? undefined,
    });
    if (error) throw error;
    const rows = z
      .array(rowSchema)
      .max(pageSize + 1)
      .parse(data);
    if (
      rows.some((row) =>
        kind === "tag"
          ? row.active !== null || row.edit_version !== null
          : row.active === null ||
            row.edit_version === null ||
            row.navigation_order === null,
      )
    )
      throw new Error("Invalid taxonomy row.");
    const items = rows.slice(0, pageSize).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentName: row.parent_name,
      navigationOrder: row.navigation_order,
      active: row.active,
      version: row.edit_version,
      referencedLive: row.referenced_live,
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > pageSize && last
          ? Buffer.from(
              JSON.stringify({ version: 1, kind, id: last.id }),
            ).toString("base64url")
          : null,
    };
  } catch {
    throw new Error("Unable to load taxonomy.");
  }
}
