"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { invalidatePublicShell } from "@/backend/public-site/public-shell-cache/public-shell-cache";
import { isDraftUuid } from "@/shared/articles/draft-contract/draft-contract";

const version = z.number().int().min(1).max(2147483647);
const uuid = z.custom<string>(isDraftUuid);
const commandSchema = z.strictObject({
  userId: uuid,
  expectedVersion: version,
  requestId: uuid,
  hidden: z.boolean(),
  clearBiography: z.boolean(),
  resetDisplayName: z.boolean(),
});
const resultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    version,
    hidden: z.boolean(),
    changed: z.boolean(),
    replayed: z.boolean(),
  }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "invalid_input",
      "not_found",
      "conflict",
      "request_conflict",
      "forbidden",
      "unavailable",
    ]),
  }),
]);

async function administratorClient() {
  const access = await getCurrentAccess();
  return access.status === "active" && access.role === "administrator"
    ? createServerSupabaseClient()
    : null;
}

export async function readProfileModerationAction(userId: string) {
  if (!isDraftUuid(userId)) return null;
  try {
    const client = await administratorClient();
    if (!client) return null;
    const { data, error } = await client
      .from("profiles")
      .select("edit_version,public_page_hidden")
      .eq("auth_user_id", userId)
      .maybeSingle();
    return !error && data
      ? { version: data.edit_version, hidden: data.public_page_hidden }
      : null;
  } catch {
    return null;
  }
}

export async function moderateProfileAction(
  value: z.infer<typeof commandSchema>,
): Promise<z.infer<typeof resultSchema>> {
  const parsed = commandSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    const client = await administratorClient();
    if (!client) return { ok: false, code: "forbidden" };
    const command = parsed.data;
    const { data, error } = await client.rpc("moderate_member_profile", {
      p_user_id: command.userId,
      p_expected_version: command.expectedVersion,
      p_request_id: command.requestId,
      p_hide_page: command.hidden,
      p_clear_biography: command.clearBiography,
      p_reset_display_name: command.resetDisplayName,
    });
    const result = resultSchema.safeParse(data);
    if (error || !result.success) return { ok: false, code: "unavailable" };
    if (result.data.ok) {
      invalidatePublicShell();
      try {
        revalidatePath("/dashboard/admin/members");
      } catch {
        console.error(
          "Profile moderation committed; member list revalidation failed.",
        );
      }
    }
    return result.data;
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
