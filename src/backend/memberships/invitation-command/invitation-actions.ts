"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  parseInvitationCommand,
  parseInvitationResult,
  type InvitationCommand,
  type InvitationResult,
} from "../../../shared/memberships/invitation-command/invitation-command";

export async function manageInvitationAction(
  command: InvitationCommand,
): Promise<InvitationResult> {
  const parsed = parseInvitationCommand(command);
  if (!parsed.ok) return parsed;
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active" || access.role !== "administrator")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const value = parsed.value;
    const call =
      value.kind === "invite"
        ? client.rpc("invite_staff", {
            p_request_id: value.requestId,
            p_entries: value.entries,
          })
        : value.kind === "changeRole"
          ? client.rpc("change_invitation_role", {
              p_invitation_id: value.invitationId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
              p_role: value.role,
            })
          : client.rpc("remove_invitation", {
              p_invitation_id: value.invitationId,
              p_expected_version: value.expectedVersion,
              p_request_id: value.requestId,
            });
    const { data, error } = await call;
    if (error) return { ok: false, code: "unavailable" };
    const result = parseInvitationResult(data, value);
    if (result.ok) {
      try {
        revalidatePath("/dashboard/admin/members");
        revalidatePath("/dashboard/admin/members/audit");
      } catch {
        console.error("Staff list change committed; revalidation failed.", {
          requestId: value.requestId,
        });
      }
    }
    return result;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
