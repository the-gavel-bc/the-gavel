"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  siteInformationCommandSchema,
  parseSiteInformationResult,
  type SiteInformationCommand,
  type SiteInformationResult,
} from "../../../shared/site-information/site-information/site-information-command";
export async function saveSiteInformationAction(
  command: SiteInformationCommand,
): Promise<SiteInformationResult> {
  const parsed = siteInformationCommandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("save_site_information", {
      p_expected_version: parsed.data.expectedVersion,
      p_request_id: parsed.data.requestId,
      p_mission: parsed.data.mission as string,
      p_contact_email: parsed.data.contactEmail as string,
      p_instagram_url: parsed.data.instagramUrl as string,
      p_submission_instructions: parsed.data.submissionInstructions as string,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseSiteInformationResult(data);
    if (result.ok) revalidatePath("/dashboard/admin/site");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
