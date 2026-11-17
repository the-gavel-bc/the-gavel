import { refuseCronRequest } from "@/backend/media/cron-auth/cron-auth";
import { expireUnusedUploads } from "@/backend/media/unused-upload-expiry/unused-upload-expiry";
// The sweep is time-boxed to about 40 s.
export const maxDuration = 60;
export async function GET(request: Request): Promise<Response> {
  const refusal = refuseCronRequest(request);
  if (refusal) return refusal;
  const result = await expireUnusedUploads();
  return Response.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
