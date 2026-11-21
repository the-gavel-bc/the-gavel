import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
const schema = z.object({
  keys: z.number().int().nonnegative(),
  prefixes: z.number().int().nonnegative(),
  unattempted: z.number().int().nonnegative(),
  failedKeys: z.number().int().nonnegative(),
  failedPrefixes: z.number().int().nonnegative(),
  lastHealthyAt: z.string().nullable(),
  oldestKeyCheck: z.string().nullable(),
  oldestPrefixCheck: z.string().nullable(),
});
export type CleanupStatus = z.infer<typeof schema>;
export function isMediaCleanupHealthy(status: CleanupStatus, now = Date.now()) {
  // Same freshness window as the database's article deletion check.
  return (
    status.lastHealthyAt !== null &&
    Date.parse(status.lastHealthyAt) > now - 48 * 60 * 60 * 1000 &&
    status.failedKeys === 0 &&
    status.failedPrefixes === 0
  );
}
export async function getMediaCleanupStatus(): Promise<CleanupStatus> {
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("get_media_cleanup_status");
    if (error) throw error;
    return schema.parse(data);
  } catch {
    throw new Error("Unable to load cleanup status.");
  }
}
