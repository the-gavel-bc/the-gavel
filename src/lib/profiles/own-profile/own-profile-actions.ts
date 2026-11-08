"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/lib/auth/access/access";
import { createServerSupabaseClient } from "@/lib/supabase/server/server";
import {
  ownProfileCommandSchema,
  parseOwnProfileResult,
  type OwnProfileCommand,
  type OwnProfileResult,
} from "../../../shared/profiles/own-profile/own-profile-command";

export async function saveOwnProfileAction(
  command: OwnProfileCommand,
): Promise<OwnProfileResult> {
  const parsed = ownProfileCommandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("save_own_public_profile", {
      p_expected_version: parsed.data.expectedVersion,
      p_request_id: parsed.data.requestId,
      p_display_name: parsed.data.displayName,
      p_biography: parsed.data.biography as string,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = parseOwnProfileResult(data, access.profileId);
    if (result.ok) revalidatePath("/dashboard/profile");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
