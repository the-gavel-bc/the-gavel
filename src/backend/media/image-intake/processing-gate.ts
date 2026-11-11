import "server-only";

// This bounds buffered/decoded jobs in one process. The database separately
// enforces per-actor admission across instances; no unbounded local queue exists.
export function createImageProcessingGate(limit = 2) {
  let active = 0;
  return () => {
    if (active >= limit) return null;
    active++;
    let held = true;
    return () => {
      if (held) {
        held = false;
        active--;
      }
    };
  };
}
export const acquireImageProcessing = createImageProcessingGate();
