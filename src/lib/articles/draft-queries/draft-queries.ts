import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import {
  decodeDraftCursor,
  encodeDraftCursor,
  isDatabaseTimestamp,
  isDraftUuid,
} from "../draft-cursor/draft-cursor";

export type ArticleSummary = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "archived";
  sectionId: string;
  version: number;
  updatedAt: string;
};
export type ArticlePage = {
  items: ArticleSummary[];
  nextCursor: string | null;
};
const pageInput = z.strictObject({
  cursor: z.string().optional(),
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

async function reader() {
  await connection();
  const access = await requireActiveMembership();
  return { access, client: await createServerSupabaseClient() };
}

export async function getMyArticlesPage(input: {
  cursor?: string;
  pageSize?: number;
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
      .select("id,title,slug,status,section_id,edit_version,updated_at")
      .eq("owner_profile_id", access.profileId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(parsed.data.pageSize + 1);
    if (cursor)
      query = query.or(
        `updated_at.lt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
      );
    const { data, error } = await query;
    if (error) throw error;
    const rows = z
      .array(summaryRow)
      .max(parsed.data.pageSize + 1)
      .parse(data);
    const items = rows
      .slice(0, parsed.data.pageSize)
      .map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        sectionId: row.section_id,
        version: row.edit_version,
        updatedAt: row.updated_at,
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
