"use server";

import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  tagNameSchema,
  ensureTagResultSchema,
  type EnsureTagResult,
} from "@/shared/taxonomy/ensure-tag/ensure-tag";

export async function ensureTagAction(name: unknown): Promise<EnsureTagResult> {
  const parsed = tagNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("ensure_tag", {
      p_name: parsed.data,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = ensureTagResultSchema.safeParse(data);
    return result.success ? result.data : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
