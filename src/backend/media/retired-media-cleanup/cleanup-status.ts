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
