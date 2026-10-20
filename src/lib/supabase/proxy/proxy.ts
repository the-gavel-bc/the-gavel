import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/lib/env/server/server";
import type { Database } from "../database/database.types";

export async function refreshSession(request: NextRequest) {
  const env = getServerEnv();
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(env.SITE_URL).protocol === "https:",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  // Token validation/refresh only. Each protected page performs membership checks.
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
