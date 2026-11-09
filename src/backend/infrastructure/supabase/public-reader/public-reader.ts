import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/backend/infrastructure/env/server/server";
import type { Database } from "@/shared/database/database.types";

// This client has no cookie adapter or persistent session, even for signed-in readers.
export function createPublicReaderClient() {
  const env = getServerEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );
}
