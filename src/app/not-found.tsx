import { connection } from "next/server";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";
import { NotFoundRecovery } from "@/frontend/features/reader/components/not-found-recovery/not-found-recovery";
export default async function NotFound() {
  // Render per request: a prerendered page has no CSP nonce, so its scripts
  // would be blocked. Unmatched URLs do not enter the public route-group
  // layout; keep this shell independent of backend availability and avoid
  // nesting a second main landmark.
  await connection();
  return (
    <ReaderSurface>
      <PublicShell>
        <NotFoundRecovery />
      </PublicShell>
    </ReaderSurface>
  );
}
