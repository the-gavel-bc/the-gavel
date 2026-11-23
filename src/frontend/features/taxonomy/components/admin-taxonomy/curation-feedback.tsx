import { Button } from "@/frontend/components/ui/button/button";
import { curationMessages, type useCuration } from "./use-curation";

export function CurationFeedback({
  state,
  showSaved = true,
}: {
  state: ReturnType<typeof useCuration>;
  showSaved?: boolean;
}) {
  const { pending, result, retry, run, reload } = state;
  return (
    <>
      {pending && <p role="status">Saving…</p>}
      {showSaved && result?.ok && <p role="status">Saved.</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{curationMessages[result.code]}</p>
          {retry && (
            <Button
              variant="secondary"
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </Button>
          )}
          {["conflict", "not_found", "request_conflict"].includes(
            result.code,
          ) && (
            <Button variant="secondary" type="button" onClick={reload}>
              Reload taxonomy
            </Button>
          )}
        </div>
      )}
    </>
  );
}
