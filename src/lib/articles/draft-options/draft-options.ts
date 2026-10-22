import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database/database.types";
import { isDraftUuid } from "../draft-cursor/draft-cursor";
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

export async function loadDraftOptions(
  client: SupabaseClient<Database>,
  sectionId?: string,
): Promise<DraftOptions> {
  try {
    const results = await Promise.all([
      client
        .from("sections")
        .select("id,name")
        .eq("active", true)
        .order("navigation_order")
        .order("name")
        .order("id"),
      sectionId
        ? client
            .from("categories")
            .select("id,name,section_id,sections!inner(active)")
            .eq("active", true)
            .eq("section_id", sectionId)
            .eq("sections.active", true)
            .order("navigation_order")
            .order("name")
            .order("id")
        : Promise.resolve({ data: [], error: null }),
      client.from("tags").select("id,name").order("name").order("id"),
      client
        .from("profiles")
        .select("id,display_name,slug")
        .eq("active", true)
        .order("display_name")
        .order("id"),
    ]);
    if (results.some((result) => result.error))
      throw new Error("Catalog read failed.");
    return {
      sections: z.array(choice).parse(results[0].data),
      categories: z
        .array(category)
        .parse(results[1].data)
        .map((row) => ({
          id: row.id,
          name: row.name,
          sectionId: row.section_id,
        })),
      tags: z.array(choice).parse(results[2].data),
      contributors: z
        .array(contributor)
        .parse(results[3].data)
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
