import "server-only";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

export type ActiveMembership = {
  status: "active";
  userId: string;
  profileId: string;
  displayName: string;
  role: "author" | "editor" | "administrator";
};
export type AccessState =
  { status: "signedOut" } | { status: "pending" } | ActiveMembership;

export async function getCurrentAccess(): Promise<AccessState> {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) return { status: "signedOut" };
  // Google must be the only linked provider: a linked email identity could
  // belong to someone who pre-registered this address. Matches the SQL gate.
  const providers: unknown = user.app_metadata.providers;
  const google =
    user.app_metadata.provider === "google" &&
    (providers === undefined ||
      (Array.isArray(providers) && providers.every((p) => p === "google")));
  if (
    !google ||
    !user.email_confirmed_at ||
    user.email?.split("@").length !== 2 ||
    user.email.split("@")[1].toLowerCase() !== "bc.edu"
  )
    return { status: "pending" };
  const readMembership = () =>
    client
      .from("memberships")
      .select("role, active")
      .eq("user_id", user.id)
      .maybeSingle();
  let { data: membership, error } = await readMembership();
  if (error) throw new Error("Unable to verify membership access.");
  if (!membership?.active) {
    // An administrator may have listed this address ahead of time; the first
    // eligible sign-in turns that listing into a membership. Nothing is
    // stored for people who are not listed.
    const { error: claimError } = await client.rpc("claim_invitation");
    if (claimError) return { status: "pending" };
    // `false` also means another request claimed the listing a moment ago, so
    // read the membership again before deciding.
    ({ data: membership, error } = await readMembership());
    if (error) throw new Error("Unable to verify membership access.");
    if (!membership?.active) return { status: "pending" };
  }
  const { data: profiles, error: profileError } =
    await client.rpc("current_profile");
  if (profileError) throw new Error("Unable to verify membership access.");
  const profile = profiles?.[0];
  if (!profile) return { status: "pending" };
  return {
    status: "active",
    userId: user.id,
    profileId: profile.id,
    displayName: profile.display_name,
    role: membership.role,
  };
}

export async function requireActiveMembership(): Promise<ActiveMembership> {
  const access = await getCurrentAccess();
  if (access.status === "signedOut") redirect("/sign-in");
  if (access.status === "pending") redirect("/access-pending");
  return access;
}
