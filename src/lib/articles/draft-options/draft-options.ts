import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/database/database.types";
import { isDraftUuid } from "../../../shared/articles/draft-cursor/draft-cursor";
const choice = z.object({
  id: z.custom<string>(isDraftUuid),
  name: z.string(),
});
const category = choice.extend({ section_id: z.custom<string>(isDraftUuid) });
const contributor = z.object({
  id: z.custom<string>(isDraftUuid),
  display_name: z.string(),
  slug: z.string(),
});
export type DraftOptions = {
  sections: { id: string; name: string }[];
  categories: { id: string; name: string; sectionId: string }[];
  tags: { id: string; name: string }[];
  contributors: { id: string; displayName: string; slug: string }[];
};

// Each page stays below the configured PostgREST max_rows=1000.
async function readAll<T>(
  page: (
    start: number,
    end: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await page(start, start + 499);
    if (result.error || !Array.isArray(result.data))
      throw new Error("Catalog read failed.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

export async function loadDraftOptions(
  client: SupabaseClient<Database>,
  sectionId?: string,
): Promise<DraftOptions> {
  try {
    const results = await Promise.all([
      readAll((start, end) =>
        client
          .from("sections")
          .select("id,name")
          .eq("active", true)
          .order("navigation_order")
          .order("name")
          .order("id")
          .range(start, end),
      ),
      sectionId ? loadDraftCategories(client, sectionId) : Promise.resolve([]),
      readAll((start, end) =>
        client
          .from("tags")
          .select("id,name")
          .order("name")
          .order("id")
          .range(start, end),
      ),
      readAll((start, end) =>
        client
          .from("profiles")
          .select("id,display_name,slug")
          .eq("active", true)
          .order("display_name")
          .order("id")
          .range(start, end),
      ),
    ]);
    return {
      sections: z.array(choice).parse(results[0]),
      categories: results[1],
      tags: z.array(choice).parse(results[2]),
      contributors: z
        .array(contributor)
        .parse(results[3])
        .map((row) => ({
          id: row.id,
          displayName: row.display_name,
          slug: row.slug,
        })),
    };
  } catch {
    throw new Error("Unable to load draft options.");
  }
}

export async function loadDraftCategories(
  client: SupabaseClient<Database>,
  sectionId: string,
): Promise<DraftOptions["categories"]> {
  const rows = await readAll((start, end) =>
    client
      .from("categories")
      .select("id,name,section_id,sections!inner(active)")
      .eq("active", true)
      .eq("section_id", sectionId)
      .eq("sections.active", true)
      .order("navigation_order")
      .order("name")
      .order("id")
      .range(start, end),
  );
  return z
    .array(category)
    .parse(rows)
    .map((row) => ({ id: row.id, name: row.name, sectionId: row.section_id }));
}
