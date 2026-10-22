import { createClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import type { Database } from "@/lib/supabase/database/database.types";
export const profileId = "00000000-0000-0000-0000-000000000001";
export const articleId = "00000000-0000-0000-0000-000000000002";
export const updatedAt = "2026-10-22T12:00:00.123456+00:00";
export const access = {
  status: "active",
  userId: profileId,
  profileId,
  displayName: "Writer",
  role: "author",
} as const;
export function queryTestClient() {
  const network = vi.fn<typeof fetch>();
  const client = createClient<Database>(
    "http://127.0.0.1:54321",
    "public-test-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: network },
    },
  );
  const respond = (value: unknown, status = 200) =>
    network.mockResolvedValueOnce(
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  return { client, network, respond };
}
