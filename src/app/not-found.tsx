import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { ReaderSurface } from "@/frontend/features/reader/components/reader-layout/reader-layout";
import { NotFoundRecovery } from "@/frontend/features/reader/components/not-found-recovery/not-found-recovery";
export default function NotFound() {
  // Unmatched URLs do not enter the public route-group layout. Keep this shell
  // independent of backend availability and avoid nesting a second main landmark.
  return (
    <ReaderSurface>
      <PublicShell>
        <NotFoundRecovery />
      </PublicShell>
    </ReaderSurface>
  );
}
