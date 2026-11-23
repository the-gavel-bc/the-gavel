"use server";
import { revalidatePath } from "next/cache";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  siteInformationTransportSchema,
  parseSiteInformationResult,
  type SiteInformationCommand,
  type SiteInformationResult,
} from "../../../shared/site-information/site-information/site-information-command";
export async function saveSiteInformationAction(
  command: SiteInformationCommand,
): Promise<SiteInformationResult> {
  // The RPC resolves exact legacy receipts before applying new text rules.
  const parsed = siteInformationTransportSchema.safeParse(command);
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
      p_spotify_url: parsed.data.spotifyUrl as string,
      p_linkedin_url: parsed.data.linkedinUrl as string,
      p_facebook_url: parsed.data.facebookUrl as string,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseSiteInformationResult(data);
    if (result.ok) {
      invalidatePublicShell();
      revalidatePath("/dashboard/admin/site");
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
