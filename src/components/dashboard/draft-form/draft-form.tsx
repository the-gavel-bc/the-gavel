"use client";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button/button";
import { DraftMetadataFields } from "../draft-metadata-fields/draft-metadata-fields";
import type {
  DraftInput,
  DraftErrorCode,
  DraftFailure,
} from "@/lib/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/lib/articles/draft-options/draft-options";
import { useDraftCommand, type DraftArticle } from "./use-draft-command";
import styles from "./draft-form.module.css";
import { DraftTaxonomyFields } from "../draft-taxonomy-fields/draft-taxonomy-fields";
import { DraftContributorFields } from "../draft-contributor-fields/draft-contributor-fields";
import { draftMetadataErrors } from "@/lib/articles/draft-contract/draft-contract";
import { draftSelectionErrors } from "@/lib/articles/draft-selections/draft-selections";
import { useDraftCategories } from "./use-draft-categories";

const DraftEditor = dynamic(
  () =>
    import("../draft-editor/draft-editor").then((module) => module.DraftEditor),
  { ssr: false, loading: () => <p role="status">Loading body editor…</p> },
);
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
  const [editorFailure, setEditorFailure] = useState<DraftFailure | null>(null);
  const reportEditorFailure = useCallback(
    (failure: DraftFailure) => setEditorFailure(failure),
    [],
  );
  const categories = useDraftCategories(
    command.draft.sectionId,
    initialDraft.sectionId,
    options.categories,
  );
  const currentOptions = { ...options, categories: categories.categories };
  const [selectionErrors, setSelectionErrors] = useState<
    Record<string, string>
  >({});
  const errors = { ...command.fieldErrors, ...selectionErrors };
  const update: typeof command.update = (value) => {
    setSelectionErrors({});
    command.update(value);
  };
  const router = useRouter();
  const summary = useRef<HTMLDivElement>(null);
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  useEffect(() => {
    if (command.failure || Object.keys(selectionErrors).length)
      summary.current?.focus();
  }, [command.failure, selectionErrors]);
  useEffect(() => {
    if (!editorFailure) return;
    // Invalid native input may differ from the last valid canonical body tracked by the controller.
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorFailure]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !options.sections.length || editorFailure) return;
    if (command.phase !== "uncertain") {
      const invalid = {
        ...draftMetadataErrors(command.draft),
        ...draftSelectionErrors(command.draft, currentOptions),
      };
      if (categories.loading || categories.error)
        invalid.categoryIds =
          "Wait for category choices or retry loading them before saving.";
      if (Object.keys(invalid).length) {
        setSelectionErrors(invalid);
        return;
      }
    }
    const saved = await command.submit();
    if (saved && !article) {
      router.push(`/dashboard/articles/${saved.id}`);
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
      <p role="status">
        {editorFailure ? "Body needs attention before saving." : status}
      </p>
      {!options.sections.length && (
        <p>
          No active sections are available. Ask an administrator to configure a
          section.
        </p>
      )}
      {(command.failure || Object.keys(selectionErrors).length > 0) && (
        <div role="alert" tabIndex={-1} ref={summary} className={styles.errors}>
          <p>
            {command.failure
              ? messages[command.failure.code]
              : "Review the highlighted selections."}
          </p>
          {command.phase === "uncertain" &&
            command.failure?.code !== "unavailable" && (
              <p>
                The earlier save is still unconfirmed. Resolve this error, then
                retry the same request.
              </p>
            )}
          {Object.keys(errors).length > 0 && (
            <ul>
              {Object.entries(errors).map(([field, message]) => (
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
          options={currentOptions}
          errors={errors}
          onChange={update}
        />
        {categories.loading && <p role="status">Loading categories…</p>}
        {categories.error && (
          <div>
            <p role="alert">
              Unable to load categories. Your selections are still here.
            </p>
            <Button type="button" onClick={categories.retry}>
              Retry categories
            </Button>
          </div>
        )}
        <DraftTaxonomyFields
          draft={command.draft}
          options={currentOptions}
          errors={errors}
          onChange={update}
        />
        <DraftContributorFields
          value={command.draft.contributors}
          options={options.contributors}
          error={errors.contributors}
          onChange={(contributors) =>
            update((current) => ({ ...current, contributors }))
          }
        />
        <DraftEditor
          value={command.draft.content}
          disabled={
            !ready || command.locked || (!article && command.phase === "saved")
          }
          onError={reportEditorFailure}
          onChange={(content) => {
            setEditorFailure(null);
            update((current) => ({ ...current, content }));
          }}
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
            Boolean(editorFailure) ||
            (command.phase !== "uncertain" &&
              (categories.loading || categories.error)) ||
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
