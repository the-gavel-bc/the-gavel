import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

export type ActiveMembership = {
  status: "active";
  userId: string;
  profileId: string;
  displayName: string;
  role: "author" | "administrator";
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
  const google =
    user.app_metadata.provider === "google" ||
    (Array.isArray(user.app_metadata.providers) &&
      user.app_metadata.providers.includes("google"));
  if (
    !google ||
    !user.email_confirmed_at ||
    user.email?.split("@").length !== 2 ||
    user.email.split("@")[1].toLowerCase() !== "bc.edu"
  )
    return { status: "pending" };
  const { data: membership, error } = await client
    .from("memberships")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("Unable to verify membership access.");
  if (!membership?.active) return { status: "pending" };
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
