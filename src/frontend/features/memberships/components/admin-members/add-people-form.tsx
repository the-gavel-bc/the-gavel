"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { manageInvitationAction } from "@/backend/memberships/invitation-command/invitation-actions";
import {
  MAX_INVITES,
  parseInviteText,
  type InvitationCommand,
  type InvitationResult,
} from "@/shared/memberships/invitation-command/invitation-command";
import { Button } from "@/frontend/components/ui/button/button";
import styles from "./admin-members.module.css";

export function AddPeopleForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [role, setRole] = useState<"author" | "administrator">("author");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [problem, setProblem] = useState("");
  // The same request id is reused while the original request is uncertain.
  const [retry, setRetry] = useState<InvitationCommand | null>(null);
  const busy = useRef(false);

  async function run(command: InvitationCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: InvitationResult;
    try {
      next = await manageInvitationAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    busy.current = false;
    setPending(false);
    setRetry(!next.ok && next.code === "unavailable" ? command : null);
    setResult(next);
    if (next.ok) {
      setText("");
      router.refresh();
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || retry) return;
    const { entries, invalid } = parseInviteText(text);
    if (invalid.length) {
      setProblem(
        `Only Boston College addresses (name@bc.edu) can be added. Check: ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}`,
      );
      return;
    }
    if (!entries.length || entries.length > MAX_INVITES) {
      setProblem(`Enter between 1 and ${MAX_INVITES} email addresses.`);
      return;
    }
    setProblem("");
    void run({
      kind: "invite",
      requestId: crypto.randomUUID(),
      entries: entries.map((entry) => ({ ...entry, role })),
    });
  }

  return (
    <form onSubmit={submit} className={styles.addForm}>
      <label>
        BC email addresses
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder={"name@bc.edu\nname@bc.edu, Optional Name"}
          disabled={pending || Boolean(retry)}
        />
      </label>
      <div className={styles.addRow}>
        <label>
          Role for everyone listed
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "author" | "administrator")
            }
            disabled={pending || Boolean(retry)}
          >
            <option value="author">Author</option>
            <option value="administrator">Administrator</option>
          </select>
        </label>
        <Button type="submit" disabled={pending || Boolean(retry)}>
          Add to staff list
        </Button>
      </div>
      {problem && <p role="alert">{problem}</p>}
      {pending && <p role="status">Saving…</p>}
      {result?.ok && "added" in result && (
        <p role="status">
          Added {result.added}
          {result.updated ? `, updated ${result.updated}` : ""}.
          {result.skipped.length
            ? ` Already members (edit them in the list): ${result.skipped.join(", ")}.`
            : ""}
        </p>
      )}
      {result && !result.ok && (
        <div role="alert">
          <p>
            {result.code === "unavailable"
              ? "The result is uncertain. Retry the original request to confirm it."
              : result.code === "forbidden"
                ? "Your administrator access no longer permits this change."
                : "Could not add these people. Check the addresses and try again."}
          </p>
          {retry && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void run(retry)}
            >
              Retry original request
            </Button>
          )}
        </div>
      )}
      <p className={styles.hint}>
        People sign in with their BC Google account and get this role
        automatically. One address per line; add a name after a comma if you
        like.
      </p>
    </form>
  );
}
