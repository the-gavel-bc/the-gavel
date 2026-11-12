import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import type { Database } from "../../../../shared/database/database.types";

export async function refreshSession(
  request: NextRequest,
  extraRequestHeaders: Record<string, string> = {},
) {
  const env = getServerEnv();
  // Rebuild from the live request each time so refreshed cookies and the
  // proxy's request headers (such as the CSP nonce) both reach rendering.
  const forward = () => {
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(extraRequestHeaders))
      headers.set(name, value);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
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
          // Update this request for downstream Server Components, then the response
          // for the browser's next request; either side alone leaves stale sessions.
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
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
