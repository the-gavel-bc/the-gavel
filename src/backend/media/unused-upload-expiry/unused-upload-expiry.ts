import "server-only";

import { z } from "zod";
import { isDraftUuid } from "@/shared/articles/draft-cursor/draft-cursor";
import { createTrustedMediaClient } from "@/backend/infrastructure/supabase/media-admin/media-admin";

// Unused article images are deleted this long after they were uploaded, once
// nothing current or retained uses them (see the staff plan, round 6).
export const RETENTION_DAYS = 7;
const BATCH = 25;
const BUDGET_MS = 40_000;
const claimed = z
  .array(
    z.object({
      asset_id: z.custom<string>(isDraftUuid),
      object_key: z.string().min(1).max(1024),
    }),
  )
  .max(BATCH);
const completion = z.looseObject({ ok: z.boolean() });

export type ExpiryResult = {
  ok: boolean;
  claimed: number;
  deleted: number;
  failed: number;
};

// Claims expired unused images, deletes their Storage objects, then lets the
// database remove the rows. A failure leaves the image hidden ("deleting")
// and the next run retries it.
export async function expireUnusedUploads(
  now: () => number = Date.now,
): Promise<ExpiryResult> {
  const client = createTrustedMediaClient();
  const bucket = client.storage.from("article-media");
  const deadline = now() + BUDGET_MS;
  const result: ExpiryResult = { ok: true, claimed: 0, deleted: 0, failed: 0 };
  // Rows that fail stay claimable, so stop a run once a batch makes no progress.
  while (now() < deadline) {
    const { data, error } = await client.rpc("claim_expired_unused_uploads", {
      p_older_than: `${RETENTION_DAYS} days`,
      p_limit: BATCH,
    });
    const rows = claimed.safeParse(data);
    if (error || !rows.success) return { ...result, ok: false };
    if (!rows.data.length) break;
    result.claimed += rows.data.length;
    let progress = 0;
    for (const row of rows.data) {
      const removed = await bucket.remove([row.object_key]);
      const done = removed.error
        ? null
        : await client.rpc("complete_expired_unused_upload", {
            p_asset_id: row.asset_id,
          });
      const ok =
        done !== null &&
        !done.error &&
        completion.safeParse(done.data).data?.ok === true;
      if (ok) {
        result.deleted += 1;
        progress += 1;
      } else result.failed += 1;
    }
    if (!progress) break;
  }
  return { ...result, ok: result.failed === 0 };
}
