"use server";
import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  ownProfileTransportSchema,
  parseOwnProfileResult,
  type OwnProfileCommand,
  type OwnProfileResult,
} from "../../../shared/profiles/own-profile/own-profile-command";

export async function saveOwnProfileAction(
  command: OwnProfileCommand,
): Promise<OwnProfileResult> {
  // The RPC resolves exact legacy receipts before applying new text rules.
  const parsed = ownProfileTransportSchema.safeParse(command);
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
    if (result.ok) {
      revalidatePath("/dashboard/profile");
      revalidatePath("/authors/[slug]", "page");
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
