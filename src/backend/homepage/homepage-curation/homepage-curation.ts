import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

const uuid = z.custom<string>(isDraftUuid);
const article = z.object({ id: uuid, title: z.string().max(240) });
const savedArticle = article.extend({
  status: z.enum(["draft", "published", "archived"]),
});
const group = <T extends z.ZodTypeAny>(entry: T) =>
  z.object({
    lead: entry.nullable(),
    featured: z.array(entry).max(4),
    readThis: z.array(entry).max(4),
  });
const curationSchema = z.object({
  version: z.number().int().positive(),
  saved: group(savedArticle),
  effective: group(article),
});
export type HomepageArticle = z.infer<typeof savedArticle>;
export type HomepageCuration = z.infer<typeof curationSchema>;

export async function getAdminHomepageCuration(): Promise<HomepageCuration> {
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("get_admin_homepage_curation");
    if (error) throw error;
    return curationSchema.parse(data);
  } catch {
    throw new Error("Unable to load homepage curation.");
  }
}
