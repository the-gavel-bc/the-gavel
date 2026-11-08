import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { createTrustedMediaClient } from "@/backend/infrastructure/supabase/media-admin/media-admin";
const uuid = z.custom<string>(isDraftUuid);
const prefixes = z
  .array(
    z.object({
      article_id: uuid,
      scan_offset: z.number().int().nonnegative(),
      claim_token: uuid,
    }),
  )
  .max(5);
const keys = z
  .array(
    z.object({ object_key: z.string().min(1).max(1024), claim_token: uuid }),
  )
  .max(30);
async function performSweep(
  client: ReturnType<typeof createTrustedMediaClient>,
  runToken: string,
): Promise<boolean> {
  const bucket = client.storage.from("article-media");
  let failed = false;
  // Reserve one service-only key, then exercise actual Storage write, remove and verification.
  const probeResult = await client.rpc("get_media_cleanup_probe", {
    p_run_token: runToken,
  });
  const probe = z
    .array(z.object({ object_key: z.string().min(1), armed: z.boolean() }))
    .length(1)
    .parse(probeResult.data)[0];
  if (probeResult.error) return false;
  const separator = probe.object_key.lastIndexOf("/");
  if (separator < 1) return false;
  const folder = probe.object_key.slice(0, separator),
    filename = probe.object_key.slice(separator + 1);
  if (!probe.armed) {
    const before = await bucket.list(folder, { limit: 1 });
    if (before.error || !before.data || before.data.length > 0) return false;
    const armed = await client.rpc("arm_media_cleanup_probe", {
      p_run_token: runToken,
    });
    if (armed.error || armed.data !== true) return false;
  }
  const image = Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  );
  const uploaded = await bucket.upload(probe.object_key, image, {
    contentType: "image/webp",
    upsert: true,
  });
  if (uploaded.error) return false;
  const removedProbe = await bucket.remove([probe.object_key]);
  if (removedProbe.error) return false;
  const verified = await bucket.list(folder, { limit: 100, search: filename });
  if (
    verified.error ||
    !verified.data ||
    verified.data.some((item) => item.name === filename)
  )
    return false;
  const prefixResult = await client.rpc("claim_retired_article_prefixes", {
    p_limit: 5,
  });
  if (prefixResult.error) return false;
  const claims = prefixes.parse(prefixResult.data);
  for (const claim of claims) {
    let count = 0;
    let success = false;
    let pageRead = false;
    try {
      const listed = await bucket.list(claim.article_id, {
        limit: 100,
        offset: claim.scan_offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (!listed.error && listed.data) {
        count = listed.data.length;
        const assetIds = listed.data
          .map((item) => item.name)
          .filter(
            (name) => name.endsWith(".webp") && name === name.toLowerCase(),
          )
          .map((name) => name.slice(0, -5))
          .filter(isDraftUuid);
        const registered = await client.rpc("register_retired_media_keys", {
          p_article_id: claim.article_id,
          p_asset_ids: assetIds,
          p_claim_token: claim.claim_token,
        });
        pageRead = !registered.error;
        success =
          pageRead &&
          registered.data === true &&
          assetIds.length === listed.data.length;
      }
    } catch {
      success = false;
    }
    const finished = await client.rpc("finish_retired_article_scan_v2", {
      p_article_id: claim.article_id,
      p_claim_token: claim.claim_token,
      p_count: count,
      p_page_read: pageRead,
      p_clean: success,
    });
    if (!success || finished.error || finished.data !== true) failed = true;
  }
  const keyResult = await client.rpc("claim_media_cleanup", { p_limit: 30 });
  if (keyResult.error) return false;
  const keyClaims = keys.parse(keyResult.data);
  for (const claim of keyClaims) {
    let success = false;
    try {
      const removed = await bucket.remove([claim.object_key]);
      success = !removed.error;
    } catch {
      success = false;
    }
    const finished = await client.rpc("finish_media_cleanup", {
      p_object_key: claim.object_key,
      p_claim_token: claim.claim_token,
      p_success: success,
    });
    if (!success || finished.error || finished.data !== true) failed = true;
  }
  const backlog = await client.rpc("get_media_cleanup_backlog");
  const parsed = z
    .object({
      staleKeys: z.number().int().nonnegative(),
      stalePrefixes: z.number().int().nonnegative(),
    })
    .safeParse(backlog.data);
  if (backlog.error || !parsed.success) return false;
  if (parsed.data.staleKeys || parsed.data.stalePrefixes) {
    console.error("Media cleanup backlog requires attention.", parsed.data);
    failed = true;
  }
  return !failed;
}
export async function runRetiredMediaCleanup(): Promise<{ ok: boolean }> {
  try {
    const client = createTrustedMediaClient();
    const started = await client.rpc("start_media_cleanup_run");
    if (started.error || !isDraftUuid(started.data)) return { ok: false };
    let success = false;
    try {
      success = await performSweep(client, started.data);
    } catch {
      success = false;
    }
    const finished = await client.rpc("finish_media_cleanup_run", {
      p_token: started.data,
      p_success: success,
    });
    return { ok: success && !finished.error && finished.data === true };
  } catch {
    return { ok: false };
  }
}
