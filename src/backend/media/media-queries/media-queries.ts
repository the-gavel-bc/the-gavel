import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

export type MainImage = {
  assetId: string;
  altText: string;
  credit: string;
};

export async function getArticleMainImage(
  articleId: string,
): Promise<MainImage | null> {
  if (!isDraftUuid(articleId)) throw new Error("Invalid article ID.");
  await requireActiveMembership();
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("article_main_images")
    .select("asset_id,alt_text,credit")
    .eq("article_id", articleId)
    .maybeSingle();
  if (error) throw new Error("Unable to load article image.");
  if (!data) return null;
  const parsed = z
    .strictObject({
      asset_id: z.custom<string>(isDraftUuid),
      alt_text: z.string().min(1).max(240),
      credit: z.string().min(1).max(240),
    })
    .parse(data);
  return {
    assetId: parsed.asset_id,
    altText: parsed.alt_text,
    credit: parsed.credit,
  };
}
