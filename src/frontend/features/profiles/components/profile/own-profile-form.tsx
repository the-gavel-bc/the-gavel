"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnProfile } from "@/backend/profiles/own-profile/own-profile";
import { saveOwnProfileAction } from "@/backend/profiles/own-profile/own-profile-actions";
import type {
  OwnProfileCommand,
  OwnProfileResult,
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
  const [name, setName] = useState(profile.displayName);
  const [biography, setBiography] = useState(profile.biography ?? "");
  const [version, setVersion] = useState(profile.version);
  const [slug, setSlug] = useState(profile.slug);
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
      setSlug(next.slug);
      router.refresh();
    }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    if (!name.trim() || name !== name.trim()) {
      setResult({ ok: false, code: "invalid_input" });
      return;
    }
    void run({
      requestId: crypto.randomUUID(),
      expectedVersion: version,
      displayName: name,
      biography: biography || null,
    });
  }
  function reload() {
    if (
      window.confirm(
        "Reload your profile? Unsaved changes in this form will be lost.",
      )
    )
      window.location.reload();
  }
  return (
    <form onSubmit={save}>
      <p>Author URL: /authors/{slug}</p>
      <p>
        {profile.slugFrozen
          ? "Your author URL is fixed after publication."
          : "Your author URL follows your display name until publication."}
      </p>
      <label>
        Public display name
        <input
          value={name}
          maxLength={120}
          required
          disabled={blocked}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Public biography
        <textarea
          value={biography}
          maxLength={5000}
          rows={5}
          disabled={blocked}
          onChange={(event) => setBiography(event.target.value)}
        />
      </label>
      <p>Profile image editing is not available yet.</p>
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
            <button type="button" onClick={reload}>
              Reload profile
            </button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to save profile changes.</noscript>
    </form>
  );
}
