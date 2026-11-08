"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  homepageCommandSchema,
  parseHomepageResult,
  type HomepageCommand,
  type HomepageResult,
} from "../../../shared/homepage/homepage-curation/homepage-command";

export async function saveHomepageAction(
  command: HomepageCommand,
): Promise<HomepageResult> {
  const parsed = homepageCommandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("save_homepage_selections", {
      p_expected_version: parsed.data.expectedVersion,
      p_request_id: parsed.data.requestId,
      p_lead: parsed.data.lead as string,
      p_featured: parsed.data.featured,
      p_read_this: parsed.data.readThis,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseHomepageResult(data);
    if (result.ok) revalidatePath("/dashboard/admin/homepage");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
