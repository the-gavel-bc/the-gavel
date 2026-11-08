import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env/server/server";
import type { Database } from "../../../shared/database/database.types";

export async function createServerSupabaseClient() {
  const env = getServerEnv();
  const store = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(env.SITE_URL).protocol === "https:",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll(values) {
          // Server Components cannot write cookies; Proxy refreshes them first.
          try {
            values.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Read-only Server Component context. */
          }
        },
      },
    },
  );
}
