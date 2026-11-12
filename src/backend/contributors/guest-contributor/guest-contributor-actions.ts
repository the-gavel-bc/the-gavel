"use server";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import {
  contributorNameSchema,
  contributorSearchResultSchema,
  guestContributorCommandSchema,
  guestContributorResultSchema,
  type ContributorSearchResult,
  type GuestContributorResult,
} from "@/shared/contributors/guest-contributor/guest-contributor";
export async function searchContributorsAction(
  query: unknown,
): Promise<ContributorSearchResult> {
  const parsed = contributorNameSchema.safeParse(query);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    if ((await getCurrentAccess()).status !== "active")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("search_contributors", {
      p_query: parsed.data,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = contributorSearchResultSchema.safeParse(data);
    return result.success ? result.data : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
export async function createGuestContributorAction(
  command: unknown,
): Promise<GuestContributorResult> {
  const parsed = guestContributorCommandSchema.safeParse(command);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  try {
    if ((await getCurrentAccess()).status !== "active")
      return { ok: false, code: "forbidden" };
    const client = await createServerSupabaseClient();
    const { data, error } = await client.rpc("create_guest_contributor", {
      p_request_id: parsed.data.requestId,
      p_display_name: parsed.data.displayName,
    });
    if (error) return { ok: false, code: "unavailable" };
    const result = guestContributorResultSchema.safeParse(data);
    return result.success ? result.data : { ok: false, code: "unavailable" };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}
