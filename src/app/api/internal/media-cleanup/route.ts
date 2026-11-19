import { refuseCronRequest } from "@/backend/media/cron-auth/cron-auth";
import { runRetiredMediaCleanup } from "@/backend/media/retired-media-cleanup/retired-media-cleanup";
// The sweep is time-boxed to about 40 s; leave headroom for the probe and health check.
export const maxDuration = 60;
export async function GET(request: Request): Promise<Response> {
  const refusal = refuseCronRequest(request);
  if (refusal) return refusal;
  const result = await runRetiredMediaCleanup();
  return Response.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
