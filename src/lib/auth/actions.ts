"use server";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signInWithGoogle() {
  const env = getServerEnv();
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/auth/callback", env.SITE_URL).href,
      queryParams: { hd: "bc.edu" },
    },
  });
  if (error || !data.url) redirect("/sign-in?error=unavailable");
  redirect(data.url);
}
export async function signOut() {
  const client = await createServerSupabaseClient();
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("Unable to sign out. Please try again.");
  redirect("/sign-in");
}
