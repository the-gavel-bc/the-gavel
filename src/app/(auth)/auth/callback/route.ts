import { NextResponse } from "next/server";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { safeDashboardPath } from "@/shared/auth/redirect/redirect";
export async function GET(request: Request) {
  const env = getServerEnv();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const client = await createServerSupabaseClient();
  let destination = "/sign-in?error=callback";
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const access = await getCurrentAccess();
      destination =
        access.status === "active"
          ? safeDashboardPath(url.searchParams.get("next"))
          : access.status === "pending"
            ? "/access-pending"
            : destination;
    }
  }
  const response = NextResponse.redirect(new URL(destination, env.SITE_URL));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
