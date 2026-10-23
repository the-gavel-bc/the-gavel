"use client";
import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button/button";
import { DraftMetadataFields } from "../draft-metadata-fields/draft-metadata-fields";
import type {
  DraftInput,
  DraftErrorCode,
} from "@/lib/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
import { useDraftCommand, type DraftArticle } from "./use-draft-command";
import styles from "./draft-form.module.css";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const messages: Record<DraftErrorCode, string> = {
  invalid_input: "Review the highlighted fields and active selections.",
  slug_conflict: "That slug is already in use. Choose another slug.",
  unavailable:
    "We could not confirm the save. Retry the same request before editing or leaving this page.",
  forbidden:
    "Your access does not currently allow saving. Your input is still here.",
  not_found: "This draft is no longer available. Your input is still here.",
  conflict:
    "This draft changed elsewhere. Your input is still here; reload to review the latest version.",
  request_conflict:
    "The request could not be reused. Your input is still here.",
  rate_limited: "Too many save attempts. Wait a minute before trying again.",
  unsupported_content:
    "This content cannot be saved by the current editor. Your input is still here.",
};
export function DraftForm({
  initialDraft,
  options,
  article,
}: {
  initialDraft: DraftInput;
  options: DraftOptions;
  article?: DraftArticle;
}) {
  const command = useDraftCommand(initialDraft, article);
  const router = useRouter();
  const summary = useRef<HTMLDivElement>(null);
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  useEffect(() => {
    if (command.failure) summary.current?.focus();
  }, [command.failure]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !options.sections.length) return;
    if ((await command.submit()) && !article) {
      router.push("/dashboard");
      router.refresh();
    }
  }
  const status =
    command.phase === "saving"
      ? "Saving draft…"
      : command.phase === "uncertain"
        ? "Save not confirmed."
        : command.phase === "saved"
          ? "Draft saved."
          : command.phase === "error"
            ? "Draft not saved."
            : command.dirty
              ? "Unsaved changes."
              : "Ready for your draft details.";
  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <noscript>
        <p>
          Enable JavaScript to create or save a draft. Nothing will be submitted
          without it.
        </p>
      </noscript>
      <p role="status">{status}</p>
      {!options.sections.length && (
        <p>
          No active sections are available. Ask an administrator to configure a
          section.
        </p>
      )}
      {command.failure && (
        <div role="alert" tabIndex={-1} ref={summary} className={styles.errors}>
          <p>{messages[command.failure.code]}</p>
          {command.phase === "uncertain" &&
            command.failure.code !== "unavailable" && (
              <p>
                The earlier save is still unconfirmed. Resolve this error, then
                retry the same request.
              </p>
            )}
          {Object.keys(command.fieldErrors).length > 0 && (
            <ul>
              {Object.entries(command.fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <a href={`#draft-${field}`}>{message}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <fieldset
        disabled={
          !ready ||
          command.locked ||
          (!article && command.phase === "saved") ||
          !options.sections.length
        }
        className={styles.fields}
      >
        <legend>Draft details</legend>
        <DraftMetadataFields
          draft={command.draft}
          options={options}
          errors={command.fieldErrors}
          onChange={command.update}
        />
      </fieldset>
      <p>Your draft stays private.</p>
      <div>
        <Button
          type="submit"
          disabled={
            !ready ||
            command.phase === "saving" ||
            command.phase === "saved" ||
            !options.sections.length
          }
        >
          {command.phase === "uncertain"
            ? "Retry same request"
            : command.phase === "saving"
              ? "Saving…"
              : article
                ? "Save draft"
                : "Create draft"}
        </Button>
      </div>
      <p>
        <a href="/dashboard">Back to My articles</a>
      </p>
    </form>
  );
}
