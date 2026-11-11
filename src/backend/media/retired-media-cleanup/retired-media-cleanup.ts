import "server-only";

import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { createTrustedMediaClient } from "@/backend/infrastructure/supabase/media-admin/media-admin";
const uuid = z.custom<string>(isDraftUuid);
// ponytail: one time-boxed run per day; capacity is roughly budget / batch
// latency. If arrivals outgrow it the backlog check reports unhealthy rather
// than claiming erasure; raise the budget or schedule runs more often then.
const SWEEP_BUDGET_MS = 40_000;
const PREFIX_BATCH = 20;
const KEY_BATCH = 100;
const prefixes = z
  .array(
    z.object({
      article_id: uuid,
      scan_offset: z.number().int().nonnegative(),
      claim_token: uuid,
    }),
  )
  .max(PREFIX_BATCH);
const keys = z
  .array(
    z.object({ object_key: z.string().min(1).max(1024), claim_token: uuid }),
  )
  .max(KEY_BATCH);
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
  // Verify the reserved folder is empty before the first overwrite. Once armed in
  // the database, this probe key can be reused after an interrupted health check.
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
  // Claims made during this run skip rows it already attempted, so each loop
  // ends once the backlog is covered or the budget is spent.
  const deadline = Date.now() + SWEEP_BUDGET_MS;
  const scanPrefix = async (claim: z.infer<typeof prefixes>[number]) => {
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
        // Only canonical UUID.webp names can enter the deletion ledger. Unknown names
        // keep the sweep unhealthy instead of granting authority to delete arbitrary paths.
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
        // A processed page may contain quarantined conflicts. Advance past it while
        // reporting it unclean; the database retains errors across the full scan cycle.
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
    return success && !finished.error && finished.data === true;
  };
  let prefixesDone = false;
  let keysDone = false;
  while (Date.now() < deadline && !(prefixesDone && keysDone)) {
    if (!prefixesDone) {
      try {
        const prefixResult = await client.rpc(
          "claim_retired_article_prefixes",
          {
            p_limit: PREFIX_BATCH,
          },
        );
        if (prefixResult.error) {
          failed = true;
          prefixesDone = true;
        }
        const claims = prefixResult.error
          ? []
          : prefixes.parse(prefixResult.data);
        if (!claims.length) prefixesDone = true;
        const results = await Promise.all(claims.map(scanPrefix));
        if (results.includes(false)) failed = true;
      } catch {
        failed = true;
        prefixesDone = true;
      }
    }
    // Ledger keys remain eligible after successful removal: a previously started
    // upload can finish late and recreate the object, requiring another sweep.
    // Finish both work classes in the current round even if a Storage call overruns.
    if (keysDone) continue;
    const keyResult = await client.rpc("claim_media_cleanup", {
      p_limit: KEY_BATCH,
    });
    if (keyResult.error) {
      failed = true;
      keysDone = true;
      continue;
    }
    const keyClaims = keys.parse(keyResult.data);
    if (!keyClaims.length) {
      keysDone = true;
      continue;
    }
    let removed = false;
    try {
      // One Storage call per batch; any error marks every key in it as failed.
      const result = await bucket.remove(keyClaims.map((c) => c.object_key));
      removed = !result.error;
    } catch {
      removed = false;
    }
    const finished = await Promise.all(
      keyClaims.map((claim) =>
        client.rpc("finish_media_cleanup", {
          p_object_key: claim.object_key,
          p_claim_token: claim.claim_token,
          p_success: removed,
        }),
      ),
    );
    if (!removed || finished.some((f) => f.error || f.data !== true))
      failed = true;
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
    // The database grants one run lease and clears prior health before work starts.
    // Only its current token can finish the run and restore deletion readiness.
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
