import "server-only";

import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";

// Main-image URLs for curation cards. Published stories are served by the
// public image route (cached, finalized assets only); a story with no main
// image, or one that is not published, simply has no entry.
export async function getHomepageImageUrls(
  articleIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(articleIds)].filter(isDraftUuid);
  if (!ids.length) return {};
  try {
    const client = await createServerSupabaseClient();
    const { data, error } = await client
      .from("article_main_images")
      .select("article_id,asset_id")
      .in("article_id", ids);
    if (error || !data) return {};
    const urls: Record<string, string> = {};
    for (const row of data)
      if (isDraftUuid(row.article_id) && isDraftUuid(row.asset_id))
        urls[row.article_id] =
          `/api/public/articles/${row.article_id}/media/${row.asset_id}`;
    return urls;
  } catch {
    // Cards fall back to a plain tile; curation still works.
    return {};
  }
}
