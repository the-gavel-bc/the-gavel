"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContributorSummary } from "@/backend/contributors/admin-contributors/admin-contributors";
import { manageContributorAction } from "@/backend/contributors/contributor-command/contributor-actions";
import type {
  ContributorCommand,
  ContributorResult,
} from "@/shared/contributors/contributor-command/contributor-command";

const messages = {
  invalid_input: "Check the display name and biography, then try again.",
  forbidden: "Your administrator access no longer permits this change.",
  not_found: "This contributor is no longer available.",
  conflict:
    "This contributor changed or is still referenced. Reload to review its state.",
  request_conflict: "This request cannot be reused. Reload contributors.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};

export function ContributorControls({
  contributor,
}: {
  contributor?: ContributorSummary;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(
    contributor?.displayName ?? "",
  );
  const [biography, setBiography] = useState(contributor?.biography ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ContributorResult | null>(null);
  const [retry, setRetry] = useState<ContributorCommand | null>(null);
  const busy = useRef(false);
  const blocked =
    pending ||
    Boolean(retry) ||
    Boolean(result?.ok) ||
    contributor?.active === false;

  async function run(command: ContributorCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: ContributorResult;
    try {
      next = await manageContributorAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(!next.ok && next.code === "unavailable" ? command : null);
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) {
      if (!contributor) {
        setDisplayName("");
        setBiography("");
        setResult(null);
      }
      router.refresh();
    }
  }

  function save() {
    if (blocked || !displayName || displayName !== displayName.trim()) return;
    const common = {
      requestId: crypto.randomUUID(),
      displayName,
      biography: biography || null,
    };
    void run(
      contributor
        ? {
            kind: "save",
            profileId: contributor.id,
            expectedVersion: contributor.version,
            ...common,
          }
        : { kind: "create", ...common },
    );
  }

  function deactivate() {
    if (!contributor || blocked || contributor.referencedLive) return;
    if (
      !window.confirm(
        `Deactivate ${contributor.displayName}? Draft credits remain but new selections will exclude this profile.`,
      )
    )
      return;
    void run({
      kind: "deactivate",
      profileId: contributor.id,
      expectedVersion: contributor.version,
      requestId: crypto.randomUUID(),
    });
  }

  const label = contributor
    ? `Edit ${contributor.displayName}`
    : "Create guest contributor";
  return (
    <section aria-label={label}>
      {contributor?.active === false ? (
        <p>Inactive contributor. Existing records are retained.</p>
      ) : (
        <div>
          <label>
            Public display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
              required
              disabled={blocked}
            />
          </label>
          <label>
            Public biography
            <textarea
              value={biography}
              onChange={(event) => setBiography(event.target.value)}
              maxLength={5000}
              rows={4}
              disabled={blocked}
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={blocked || !displayName.trim()}
          >
            {contributor ? "Save contributor" : "Create contributor"}
          </button>
          {contributor && (
            <button
              type="button"
              onClick={deactivate}
              disabled={blocked || contributor.referencedLive}
            >
              Deactivate contributor
            </button>
          )}
          {contributor?.referencedLive && (
            <p>
              Published or archived article references prevent deactivation.
            </p>
          )}
        </div>
      )}
      {pending && <p role="status">Saving contributor…</p>}
      {result?.ok && <p role="status">Contributor saved. Refreshing…</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {retry && (
            <button
              type="button"
              onClick={() => void run(retry)}
              disabled={pending}
            >
              Retry original request
            </button>
          )}
          {["conflict", "request_conflict", "not_found"].includes(
            result.code,
          ) && (
            <button type="button" onClick={() => router.refresh()}>
              Reload contributors
            </button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to manage contributors.</noscript>
    </section>
  );
}
