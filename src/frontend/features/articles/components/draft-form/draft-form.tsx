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
import { Button } from "@/frontend/components/ui/button/button";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import {
  DraftMetadataFields,
  DraftSeoFields,
} from "../draft-metadata-fields/draft-metadata-fields";
import type {
  DraftInput,
  DraftErrorCode,
  DraftFailure,
} from "@/shared/articles/draft-contract/draft-contract";
import type { DraftOptions } from "@/backend/articles/draft-options/draft-options";
import { useDraftCommand, type DraftArticle } from "./use-draft-command";
import styles from "./draft-form.module.css";
import { DraftTaxonomyFields } from "../../../taxonomy/components/draft-taxonomy-fields/draft-taxonomy-fields";
import { DraftContributorFields } from "../../../contributors/components/draft-contributor-fields/draft-contributor-fields";
import { draftMetadataErrors } from "@/shared/articles/draft-contract/draft-contract";
import { draftSelectionErrors } from "@/frontend/features/articles/draft-selections/draft-selections";
import { useDraftCategories } from "./use-draft-categories";
import { DraftConflictPanel } from "../draft-conflict-panel/draft-conflict-panel";
import { useDraftNavigationGuard } from "../../../../components/dashboard/draft-navigation-guard/draft-navigation-guard";
import { GuardedDashboardLink } from "../../../../components/dashboard/guarded-dashboard-link/guarded-dashboard-link";
import { ArticleMedia } from "../article-media/article-media";
import type { MainImage } from "@/backend/media/media-queries/media-queries";
import { DraftReadOnlyBody } from "../draft-editor/draft-read-only-body";
import { ArticleLifecycleControls } from "../article-lifecycle-controls/article-lifecycle-controls";

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
  not_found: "This article is no longer available. Your input is still here.",
  conflict:
    "This article changed elsewhere. Your input is still here; reload to review the latest version.",
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
  status = "draft",
}: {
  initialDraft: DraftInput;
  options: DraftOptions;
  article?: DraftArticle;
  initialImage?: MainImage | null;
  status?: "draft" | "published";
}) {
  const command = useDraftCommand(initialDraft, article, status);
  const [editorFailure, setEditorFailure] = useState<DraftFailure | null>(null);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [bodyMediaDirty, setBodyMediaDirty] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
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
  const [recoveryStatus, setRecoveryStatus] = useState<
    "draft" | "published" | null
  >(null);
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
  const { confirm, confirmDialog } = useConfirm();
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
      mediaBusy ||
      bodyMediaDirty ||
      lifecycleBusy,
  );
  // A photo chosen before the draft exists: the draft is created first, then
  // ArticleMedia uploads it. The editor stays mounted so the file survives.
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const createdInPlace = useRef(false);
  const [inPlace, setInPlace] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(pendingPhoto);
  }
  // Cancel leaves the editor without saving. Saved versions are untouched.
  async function cancelEditing() {
    if (
      (command.dirty || mediaDirty || bodyMediaDirty) &&
      !(await confirm({
        title: "Discard your changes?",
        message: "Anything you have not saved will be lost.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        danger: true,
      }))
    )
      return;
    router.push("/dashboard");
  }
  async function save(photo: File | null) {
    if (mediaBusy || lifecycleBusy || (recoveryBlocked && !command.pending))
      return;
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
    setSelectionErrors({});
    if (photo && !article) {
      createdInPlace.current = true;
      setInPlace(true);
    }
    const saved = await command.submit();
    if (!saved || article) return;
    if (createdInPlace.current) {
      window.history.replaceState(null, "", `/dashboard/articles/${saved.id}`);
    } else if (!command.hasUncommitted()) {
      router.push(`/dashboard/articles/${saved.id}`);
      router.refresh();
    }
  }
  const saveStatus =
    command.phase === "saving"
      ? status === "published"
        ? "Saving article…"
        : "Saving draft…"
      : command.phase === "uncertain"
        ? "Save not confirmed."
        : command.phase === "saved"
          ? status === "published"
            ? "Article saved."
            : "Draft saved."
          : command.phase === "error" || command.phase === "conflict"
            ? status === "published"
              ? "Article not saved."
              : "Draft not saved."
            : command.dirty
              ? "Unsaved changes."
              : status === "published"
                ? "Ready for article changes."
                : "Ready for your draft details.";
  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <noscript>
        <p>
          Enable JavaScript to save article changes. Nothing will be submitted
          without it.
        </p>
        <DraftReadOnlyBody
          content={initialDraft.content}
          articleId={article?.id}
        />
      </noscript>
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
              "request_conflict",
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
              // The mounted save action is status-specific. Never combine a new
              // status/version with this editor's old mutation mode or local input.
              if (detail.status !== status) {
                setRecoveryStatus(detail.status);
                setRecoveryBlocked(true);
                return false;
              }
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
              setRecoveryStatus(null);
              setRecoveryVisible(true);
              return true;
            }}
          />
        )}
      {recoveryStatus && (
        <section aria-label="Article status changed">
          <p role="alert">
            This article is now {recoveryStatus}. Your local input has not been
            replaced. Reload to open its current editor.
          </p>
          <Button
            type="button"
            disabled={Boolean(command.pending)}
            onClick={() => window.location.reload()}
          >
            Reload article
          </Button>
        </section>
      )}
      <fieldset
        disabled={
          !ready ||
          lifecycleBusy ||
          (!article && !inPlace && command.phase === "saved")
        }
        className={styles.fields}
      >
        <legend>
          {status === "published" ? "Article details" : "Draft details"}
        </legend>
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
          key={`taxonomy:${catalog.revision}`}
          draft={command.draft}
          options={currentOptions}
          errors={errors}
          onChange={update}
          onOption={(tag) =>
            setCatalog((current) => ({
              ...current,
              options: {
                ...current.options,
                tags: [
                  ...current.options.tags.filter((item) => item.id !== tag.id),
                  tag,
                ],
              },
            }))
          }
        />
        <DraftContributorFields
          key={catalog.revision}
          value={command.draft.contributors}
          options={catalog.options.contributors}
          error={errors.contributors}
          onOption={(contributor) =>
            setCatalog((current) => ({
              ...current,
              options: {
                ...current.options,
                contributors: [
                  ...current.options.contributors.filter(
                    (item) => item.id !== contributor.id,
                  ),
                  contributor,
                ],
              },
            }))
          }
          onChange={(contributors) =>
            update((current) => ({ ...current, contributors }))
          }
        />
        <DraftEditor
          key={`${catalog.revision}:${command.article?.id ?? "new"}`}
          value={command.draft.content}
          articleId={command.article?.id}
          allowImageUpload={status === "draft"}
          onMediaDirtyChange={setBodyMediaDirty}
          disabled={
            !ready ||
            lifecycleBusy ||
            (!article && !inPlace && command.phase === "saved")
          }
          onError={reportEditorFailure}
          onChange={(content) => {
            setEditorFailure(null);
            command.update((current) => ({ ...current, content }), true);
          }}
        />
      </fieldset>
      {!command.article && (
        <section
          aria-labelledby="new-draft-image-heading"
          className={styles.newPhoto}
        >
          <h2 id="new-draft-image-heading">Main image</h2>
          <p>
            JPEG, PNG or WebP, up to 10 MB. Choosing a photo saves your draft
            first, then uploads it.
          </p>
          <label htmlFor="article-image-file">Image file</label>
          <input
            id="article-image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!ready || command.phase === "saving"}
            onChange={(event) => {
              const photo = event.target.files?.[0] ?? null;
              setPendingPhoto(photo);
              if (photo) void save(photo);
            }}
          />
          {pendingPhoto && (
            <p>
              {pendingPhoto.name} will upload once the draft is saved. Fix any
              highlighted fields, then choose Create draft.
            </p>
          )}
        </section>
      )}
      {command.article && (
        <ArticleMedia
          initialFile={pendingPhoto}
          published={status === "published"}
          article={command.article}
          initialImage={initialImage ?? null}
          disabled={
            command.dirty ||
            Boolean(command.pending) ||
            command.phase === "saving" ||
            command.phase === "conflict" ||
            lifecycleBusy
          }
          onCommit={(result) => {
            command.acknowledgeArticle({
              id: result.articleId,
              version: result.version,
              updatedAt: result.updatedAt,
            });
          }}
          onBusyChange={setMediaBusy}
          onDirtyChange={setMediaDirty}
        />
      )}
      <fieldset
        disabled={
          !ready ||
          lifecycleBusy ||
          (!article && !inPlace && command.phase === "saved")
        }
        className={styles.fields}
      >
        <legend>Search details</legend>
        <DraftSeoFields
          draft={command.draft}
          errors={errors}
          onChange={update}
        />
      </fieldset>
      <div className={styles.saveBar} data-draft-save-bar="">
        <div className={styles.saveText}>
          <p role="status">
            {editorFailure ? "Body needs attention before saving." : saveStatus}
          </p>
          <p>
            {status === "published"
              ? "This article remains published when you save changes."
              : "Your draft stays private."}
          </p>
        </div>
        <div className={styles.saveActions}>
          <Button
            type="button"
            variant="secondary"
            disabled={command.phase === "saving"}
            onClick={() => void cancelEditing()}
          >
            Cancel
          </Button>
          {command.article && (
            <ArticleLifecycleControls
              compact
              articleId={command.article.id}
              version={command.article.version}
              status={status}
              onBusyChange={setLifecycleBusy}
              disabled={
                !ready ||
                command.dirty ||
                Boolean(command.pending) ||
                Boolean(editorFailure) ||
                mediaDirty ||
                mediaBusy ||
                bodyMediaDirty ||
                recoveryBlocked ||
                categories.loading ||
                Boolean(categories.error) ||
                Boolean(command.failure)
              }
            />
          )}
          <Button
            type="submit"
            disabled={
              !ready ||
              lifecycleBusy ||
              mediaBusy ||
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
                  ? status === "published"
                    ? "Save article"
                    : "Save draft"
                  : "Create draft"}
          </Button>
        </div>
      </div>
      <p>
        <GuardedDashboardLink href="/dashboard">
          Back to My articles
        </GuardedDashboardLink>
      </p>
      {confirmDialog}
    </form>
  );
}
