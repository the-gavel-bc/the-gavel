import "server-only";

import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";

const rowSchema = z.object({
  display_name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  biography: z.string().max(5000).nullable(),
  edit_version: z.number().int().positive(),
  slug_frozen: z.boolean(),
});
export type OwnProfile = {
  displayName: string;
  slug: string;
  biography: string | null;
  version: number;
  slugFrozen: boolean;
};
export async function getOwnProfile(): Promise<OwnProfile> {
  await connection();
  await requireActiveMembership();
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("get_own_public_profile");
    if (error) throw error;
    const rows = z.array(rowSchema).length(1).parse(data);
    const row = rows[0];
    return {
      displayName: row.display_name,
      slug: row.slug,
      biography: row.biography,
      version: row.edit_version,
      slugFrozen: row.slug_frozen,
    };
  } catch {
    throw new Error("Unable to load your profile.");
  }
}
