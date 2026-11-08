"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseContributorCommand,
  parseContributorResult,
  type ContributorCommand,
  type ContributorResult,
} from "../../../shared/contributors/contributor-command/contributor-command";

export async function manageContributorAction(
  command: ContributorCommand,
): Promise<ContributorResult> {
  const parsed = parseContributorCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.value;
    const call =
      value.kind === "create"
        ? client.rpc("create_guest_contributor", {
            p_request_id: value.requestId,
            p_display_name: value.displayName,
            p_biography: value.biography as string,
          })
        : value.kind === "save"
          ? client.rpc("save_contributor_profile", {
              p_profile_id: value.profileId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
              p_display_name: value.displayName,
              p_biography: value.biography as string,
            })
          : client.rpc("deactivate_contributor_profile", {
              p_profile_id: value.profileId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
            });
    const { data, error } = await call;
    if (error) return { ok: false, code: "unavailable" };
    const result = parseContributorResult(data, value);
    if (result.ok) revalidatePath("/dashboard/admin/contributors");
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
