import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server/server";
import type { Database } from "../../../shared/database/database.types";

export function createTrustedMediaClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.trim().length < 20)
    throw new Error(
      "Invalid server environment variable: SUPABASE_SERVICE_ROLE_KEY",
    );
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
