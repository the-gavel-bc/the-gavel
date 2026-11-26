import "server-only";
import { z } from "zod";
import { createPublicReaderClient } from "@/backend/infrastructure/supabase/public-reader/public-reader";

const metaSchema = z
  .array(z.object({ alt: z.string().min(1).max(240), updated_at: z.string() }))
  .max(1);
export type AboutImage = { alt: string; url: string };

// Public read, also used by the admin screen. A failed read means no image.
export async function getAboutImage(): Promise<AboutImage | null> {
  try {
    const { data, error } = await createPublicReaderClient().rpc(
      "get_public_site_about_image_meta",
    );
    if (error) return null;
    const parsed = metaSchema.safeParse(data);
    const row = parsed.success ? parsed.data[0] : undefined;
    const at = row ? Date.parse(row.updated_at) : NaN;
    return row && !Number.isNaN(at)
      ? { alt: row.alt, url: `/api/public/site/about-image?v=${at}` }
      : null;
  } catch {
    return null;
  }
}
