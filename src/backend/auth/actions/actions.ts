"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

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
  // Drop client-cached pages so Back cannot show the dashboard afterwards.
  revalidatePath("/", "layout");
  redirect("/sign-in");
}
