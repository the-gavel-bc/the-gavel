"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseMemberCommand,
  parseMemberResult,
  type MemberCommand,
  type MemberResult,
} from "../../../shared/memberships/member-command/member-command";

export async function manageMembershipAction(
  command: MemberCommand,
): Promise<MemberResult> {
  const parsed = parseMemberCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.value;
    const call =
      value.kind === "approve"
        ? client.rpc("approve_membership", {
            p_target_user_id: value.targetUserId,
            p_request_id: value.requestId,
            p_role: value.role,
            p_display_name: value.displayName,
            p_expected_version: value.expectedVersion,
          })
        : value.kind === "changeRole"
          ? client.rpc("change_membership_role", {
              p_target_user_id: value.targetUserId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
              p_role: value.role,
            })
          : client.rpc("deactivate_membership", {
              p_target_user_id: value.targetUserId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
            });
    const { data, error } = await call;
    if (error) return { ok: false, code: "unavailable" };
    const result = parseMemberResult(data, value);
    if (result.ok) {
      invalidatePublicShell();
      try {
        revalidatePath("/dashboard/admin/members");
        revalidatePath("/dashboard/admin/members/audit");
      } catch {
        console.error("Membership change committed; revalidation failed.", {
          requestId: value.requestId,
        });
      }
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
