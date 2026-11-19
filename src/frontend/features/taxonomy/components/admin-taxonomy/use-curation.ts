"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { curateTaxonomyAction } from "@/backend/taxonomy/taxonomy-curation/taxonomy-curation-action";
import type {
  CurationResult,
  TaxonomyCuration,
} from "@/shared/taxonomy/taxonomy-curation/taxonomy-curation";

export const curationMessages = {
  invalid_input: "Check the name and try again.",
  forbidden: "Your administrator access no longer permits this change.",
  not_found: "This item is no longer available. Reload taxonomy.",
  conflict:
    "That name is taken, or the item changed or is in use. Reload to review it.",
  request_conflict: "This request cannot be reused. Reload taxonomy.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
} as const;

// One request at a time; an uncertain result keeps the original request (same
// id) so retrying replays it instead of repeating the change.
export function useCuration(onDone?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CurationResult | null>(null);
  const [retry, setRetry] = useState<TaxonomyCuration | null>(null);
  const busy = useRef(false);
  async function run(
    command: TaxonomyCuration,
  ): Promise<CurationResult | null> {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: CurationResult;
    try {
      next = await curateTaxonomyAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(!next.ok && next.code === "unavailable" ? command : null);
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) {
      onDone?.();
      router.refresh();
    }
    return next;
  }
  return {
    pending,
    result,
    retry,
    blocked: pending || Boolean(retry),
    run,
    reload: () => {
      setResult(null);
      router.refresh();
    },
  };
}
