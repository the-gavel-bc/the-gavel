"use client";

import { useRef, useState } from "react";
import {
  moderateProfileAction,
  readProfileModerationAction,
} from "@/backend/profiles/profile-moderation/profile-moderation-actions";
import styles from "./admin-members.module.css";
import { Button } from "@/frontend/components/ui/button/button";

type ProfileSettings = NonNullable<
  Awaited<ReturnType<typeof readProfileModerationAction>>
>;
type Command = Parameters<typeof moderateProfileAction>[0];

export function ProfileModeration({ userId }: { userId: string }) {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [hidden, setHidden] = useState(false);
  const [clearBiography, setClearBiography] = useState(false);
  const [resetDisplayName, setResetDisplayName] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);
  const inFlight = useRef(false);

  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const result = await readProfileModerationAction(userId).catch(() => null);
    setSettings(result);
    if (result) setHidden(result.hidden);
    else setError("Profile settings could not be loaded.");
    setBusy(false);
    inFlight.current = false;
  }

  async function save() {
    if (!settings || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setUpdated(false);
    const command = pending ?? {
      userId,
      expectedVersion: settings.version,
      requestId: crypto.randomUUID(),
      hidden,
      clearBiography,
      resetDisplayName,
    };
    const result = await moderateProfileAction(command).catch(
      () => ({ ok: false, code: "unavailable" }) as const,
    );
    setPending(!result.ok && result.code === "unavailable" ? command : null);
    if (result.ok) {
      setSettings({ version: result.version, hidden: result.hidden });
      setClearBiography(false);
      setResetDisplayName(false);
      setUpdated(true);
    } else if (result.code === "conflict") {
      setSettings(null);
      setError(
        "This profile changed. Reload its settings and review your choices.",
      );
    } else {
      setError("Profile moderation could not be saved.");
    }
    setBusy(false);
    inFlight.current = false;
  }

  return (
    <details
      className={styles.moderation}
      onToggle={(event) => {
        if (event.currentTarget.open && !settings && !error) void load();
      }}
    >
      <summary>Moderate public profile</summary>
      {settings ? (
        <fieldset disabled={busy}>
          <legend>Profile visibility and public details</legend>
          <label>
            <input
              type="checkbox"
              checked={hidden}
              disabled={Boolean(pending)}
              onChange={(event) => setHidden(event.target.checked)}
            />{" "}
            Hide public author page
          </label>
          <label>
            <input
              type="checkbox"
              checked={clearBiography}
              disabled={Boolean(pending)}
              onChange={(event) => setClearBiography(event.target.checked)}
            />{" "}
            Clear biography
          </label>
          <label>
            <input
              type="checkbox"
              checked={resetDisplayName}
              disabled={Boolean(pending)}
              onChange={(event) => setResetDisplayName(event.target.checked)}
            />{" "}
            Reset display name to Gavel contributor
          </label>
          <Button onClick={() => void save()}>
            {pending ? "Retry profile update" : "Save public profile settings"}
          </Button>
        </fieldset>
      ) : error ? (
        <Button disabled={busy} variant="secondary" onClick={() => void load()}>
          Reload profile settings
        </Button>
      ) : (
        <p role="status">Loading profile settings…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {updated && <p role="status">Public profile settings saved.</p>}
    </details>
  );
}
