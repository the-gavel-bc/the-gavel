"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public/public";
import type { Database } from "../database/database.types";

// Foundation authentication is server-owned; browser queries remain anonymous.
export function createBrowserSupabaseClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
