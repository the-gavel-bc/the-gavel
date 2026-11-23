import { z } from "zod";
import { createServiceSupabaseClient } from "@/backend/infrastructure/supabase/service/service";
import { refuseCronRequest } from "@/backend/media/cron-auth/cron-auth";

const batch = 100;
const resultSchema = z.strictObject({
  ok: z.literal(true),
  deleted: z.number().int().min(0).max(batch),
  busy: z.boolean(),
});

export async function GET(request: Request): Promise<Response> {
  const refusal = refuseCronRequest(request);
  if (refusal) return refusal;
  const headers = { "Cache-Control": "no-store" };
  try {
    const { data, error } = await createServiceSupabaseClient().rpc(
      "sweep_orphan_guest_credits",
      { p_limit: batch },
    );
    const result = resultSchema.safeParse(data);
    if (!error && result.success)
      return Response.json(result.data, {
        status: result.data.busy ? 503 : 200,
        headers,
      });
  } catch {
    // Keep service configuration and RPC internals outside the response.
  }
  return Response.json({ ok: false }, { status: 503, headers });
}
