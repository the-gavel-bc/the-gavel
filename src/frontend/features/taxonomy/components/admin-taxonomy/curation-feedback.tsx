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
            <button
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </button>
          )}
          {["conflict", "not_found", "request_conflict"].includes(
            result.code,
          ) && (
            <button type="button" onClick={reload}>
              Reload taxonomy
            </button>
          )}
        </div>
      )}
    </>
  );
}
