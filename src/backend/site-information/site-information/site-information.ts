import { connection } from "next/server";
import { z } from "zod";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { createServerSupabaseClient } from "@/backend/infrastructure/supabase/server/server";
const rowSchema = z.object({
  edit_version: z.number().int().positive(),
  mission: z.string().max(5000).nullable(),
  contact_email: z.string().max(254).nullable(),
  instagram_url: z.string().max(255).nullable(),
  submission_instructions: z.string().max(5000).nullable(),
});
export type SiteInformation = {
  version: number;
  mission: string | null;
  contactEmail: string | null;
  instagramUrl: string | null;
  submissionInstructions: string | null;
};
export async function getSiteInformation(): Promise<SiteInformation> {
  await connection();
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    throw new Error("Administrator access required.");
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.rpc("get_site_information");
    if (error) throw error;
    const [row] = z.array(rowSchema).length(1).parse(data);
    return {
      version: row.edit_version,
      mission: row.mission,
      contactEmail: row.contact_email,
      instagramUrl: row.instagram_url,
      submissionInstructions: row.submission_instructions,
    };
  } catch {
    throw new Error("Unable to load site information.");
  }
}
