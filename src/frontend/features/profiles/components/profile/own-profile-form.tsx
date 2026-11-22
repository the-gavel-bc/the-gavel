"use client";
import { useFieldErrors } from "@/frontend/components/ui/field-errors/use-field-errors";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfilePhotoControl } from "./profile-photo-control";
import type { OwnProfile } from "@/backend/profiles/own-profile/own-profile";
import { saveOwnProfileAction } from "@/backend/profiles/own-profile/own-profile-actions";
import {
  ownProfileCommandSchema,
  type OwnProfileCommand,
  type OwnProfileResult,
} from "@/shared/profiles/own-profile/own-profile-command";

const messages = {
  invalid_input: "Check the display name and biography, then try again.",
  forbidden: "Your access no longer permits profile changes.",
  conflict:
    "Your profile changed elsewhere. Reload to review the latest version.",
  request_conflict: "This request cannot be reused. Reload your profile.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};
export function OwnProfileForm({ profile }: { profile: OwnProfile }) {
  const router = useRouter();
  const fields = useFieldErrors();
  const { confirm, confirmDialog } = useConfirm();
  const [name, setName] = useState(profile.displayName);
  const [biography, setBiography] = useState(profile.biography ?? "");
  const [version, setVersion] = useState(profile.version);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OwnProfileResult | null>(null);
  const [retry, setRetry] = useState<OwnProfileCommand | null>(null);
  const busy = useRef(false);
  const blocked = pending || Boolean(retry);
  async function run(command: OwnProfileCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: OwnProfileResult;
    try {
      next = await saveOwnProfileAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetry(
      !next.ok && (next.code === "unavailable" || retry !== null)
        ? command
        : null,
    );
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) {
      setVersion(next.version);
      router.refresh();
    }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const parsed = ownProfileCommandSchema.safeParse({
      requestId: crypto.randomUUID(),
      expectedVersion: version,
      displayName: name,
      biography: biography || null,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "displayName")
          errors.displayName =
            "Enter a display name without edge spaces or control characters.";
        if (issue.path[0] === "biography")
          errors.biography =
            "Enter a biography up to 5,000 characters without control characters.";
      }
      fields.show(event.currentTarget, errors);
      setResult(
        Object.keys(errors).length
          ? null
          : { ok: false, code: "invalid_input" },
      );
      return;
    }
    void run(parsed.data);
  }
  async function reload() {
    if (
      await confirm({
        title: "Reload your profile?",
        message: "Unsaved changes in this form will be lost.",
        confirmLabel: "Reload",
        cancelLabel: "Keep editing",
        danger: true,
      })
    )
      window.location.reload();
  }
  return (
    <form onSubmit={save} noValidate>
      <label>
        Public display name
        <input
          {...fields.input("displayName")}
          value={name}
          maxLength={120}
          required
          disabled={blocked}
          onChange={(event) => {
            setName(event.target.value);
            fields.clear("displayName");
          }}
        />
      </label>
      <label>
        Public biography
        <textarea
          {...fields.input("biography")}
          value={biography}
          maxLength={5000}
          rows={5}
          disabled={blocked}
          onChange={(event) => {
            setBiography(event.target.value);
            fields.clear("biography");
          }}
        />
      </label>
      <ProfilePhotoControl name={name} photoUrl={profile.photoUrl} />
      {fields.messages}
      <button type="submit" disabled={blocked}>
        Save profile
      </button>
      {pending && <p role="status">Saving profile…</p>}
      {result?.ok && <p role="status">Profile saved.</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {retry && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </button>
          )}
          {["conflict", "request_conflict"].includes(result.code) && (
            <button type="button" onClick={() => void reload()}>
              Reload profile
            </button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to save profile changes.</noscript>
      {confirmDialog}
    </form>
  );
}
