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
import { DraftConflictPanel } from "../draft-conflict-panel/draft-conflict-panel";
import { useDraftNavigationGuard } from "../draft-navigation-guard/draft-navigation-guard";
import { GuardedDashboardLink } from "../guarded-dashboard-link/guarded-dashboard-link";
import { ArticleMedia } from "../article-media/article-media";
import type { MainImage } from "@/lib/media/media-queries/media-queries";
import { DraftReadOnlyBody } from "../draft-editor/draft-read-only-body";

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
  slug_conflict: "We could not assign an article address. Retry your save.",
  unavailable:
    "We could not confirm the save. Retry the original save to confirm it. Newer edits stay in this tab.",
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
  initialImage,
}: {
  initialDraft: DraftInput;
  options: DraftOptions;
  article?: DraftArticle;
  initialImage?: MainImage | null;
}) {
  const command = useDraftCommand(initialDraft, article);
  const [editorFailure, setEditorFailure] = useState<DraftFailure | null>(null);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [bodyMediaDirty, setBodyMediaDirty] = useState(false);
  const { editorInvalid } = command;
  const reportEditorFailure = useCallback(
    (failure: DraftFailure) => {
      setEditorFailure(failure);
      editorInvalid();
    },
    [editorInvalid],
  );
  const [catalog, setCatalog] = useState({
    options,
    sectionId: initialDraft.sectionId,
    revision: 0,
  });
  useEffect(() => {
    if (catalog.revision > 0) document.getElementById("draft-title")?.focus();
  }, [catalog.revision]);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const categories = useDraftCategories(
    command.draft.sectionId,
    catalog.sectionId,
    catalog.options.categories,
    catalog.revision,
  );
  const currentOptions = {
    ...catalog.options,
    categories: categories.categories,
  };
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
  const hasSelectionErrors = Object.keys(selectionErrors).length > 0;
  useEffect(() => {
    if (
      (command.failure || hasSelectionErrors) &&
      !document.activeElement?.matches(
        'input,textarea,select,[contenteditable="true"]',
      )
    )
      summary.current?.focus();
  }, [command.failure, hasSelectionErrors]);
  useDraftNavigationGuard(
    command.dirty ||
      Boolean(command.pending) ||
      Boolean(editorFailure) ||
      mediaDirty ||
      bodyMediaDirty,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryBlocked && !command.pending) return;
    if (
      !ready ||
      (!command.pending && (!catalog.options.sections.length || editorFailure))
    )
      return;
    if (!command.pending) {
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
    if (saved && !article && !command.hasUncommitted()) {
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
          : command.phase === "error" || command.phase === "conflict"
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
        <DraftReadOnlyBody
          content={initialDraft.content}
          articleId={article?.id}
        />
      </noscript>
      <p role="status">
        {editorFailure ? "Body needs attention before saving." : status}
      </p>
      {!catalog.options.sections.length && (
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
      {command.article &&
        (recoveryVisible ||
          (!command.pending &&
            [
              "conflict",
              "forbidden",
              "not_found",
              "unsupported_content",
            ].includes(command.failure?.code ?? ""))) && (
          <DraftConflictPanel
            articleId={command.article.id}
            local={command.draft}
            options={currentOptions}
            nativeInvalid={Boolean(editorFailure)}
            disabled={Boolean(command.pending)}
            onBlocked={() => {
              setRecoveryBlocked(true);
              setRecoveryVisible(true);
            }}
            onLoad={(detail, nextOptions) => {
              if (
                !command.reload(detail.draft, {
                  id: detail.articleId,
                  version: detail.version,
                  updatedAt: detail.updatedAt,
                })
              )
                return false;
              setCatalog((current) => ({
                options: nextOptions,
                sectionId: detail.draft.sectionId,
                revision: current.revision + 1,
              }));
              setEditorFailure(null);
              setSelectionErrors({});
              setRecoveryBlocked(false);
              setRecoveryVisible(true);
              return true;
            }}
          />
        )}
      <fieldset
        disabled={!ready || (!article && command.phase === "saved")}
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
          options={catalog.options.contributors}
          error={errors.contributors}
          onChange={(contributors) =>
            update((current) => ({ ...current, contributors }))
          }
        />
        <DraftEditor
          key={`${catalog.revision}:${command.article?.id ?? "new"}`}
          value={command.draft.content}
          articleId={command.article?.id}
          onMediaDirtyChange={setBodyMediaDirty}
          disabled={!ready || (!article && command.phase === "saved")}
          onError={reportEditorFailure}
          onChange={(content) => {
            setEditorFailure(null);
            command.update((current) => ({ ...current, content }), true);
          }}
        />
      </fieldset>
      {command.article && (
        <ArticleMedia
          article={command.article}
          initialImage={initialImage ?? null}
          disabled={
            command.dirty ||
            Boolean(command.pending) ||
            command.phase === "saving" ||
            command.phase === "conflict"
          }
          onCommit={(result) => {
            command.reload(command.draft, {
              id: result.articleId,
              version: result.version,
              updatedAt: result.updatedAt,
            });
          }}
          onDirtyChange={setMediaDirty}
        />
      )}
      <p>Your draft stays private.</p>
      <div>
        <Button
          type="submit"
          disabled={
            !ready ||
            command.phase === "saving" ||
            command.phase === "saved" ||
            command.phase === "conflict" ||
            (!command.pending && recoveryBlocked) ||
            (!command.pending &&
              (Boolean(editorFailure) ||
                categories.loading ||
                categories.error ||
                !catalog.options.sections.length))
          }
        >
          {command.phase === "uncertain"
            ? "Retry original save"
            : command.phase === "saving"
              ? "Saving…"
              : command.article
                ? "Save draft"
                : "Create draft"}
        </Button>
      </div>
      <p>
        <GuardedDashboardLink href="/dashboard">
          Back to My articles
        </GuardedDashboardLink>
      </p>
    </form>
  );
}
