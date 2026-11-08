"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberSummary } from "@/lib/memberships/member-directory/member-directory";
import { manageMembershipAction } from "@/lib/memberships/member-command/member-actions";
import type {
  MemberCommand,
  MemberResult,
} from "@/shared/memberships/member-command/member-command";
import styles from "./admin-members.module.css";

const messages = {
  invalid_input: "Check the public name and role, then try again.",
  forbidden: "Your administrator access no longer permits this change.",
  not_found: "This person is no longer available.",
  conflict: "Membership changed elsewhere. Reload to review its current state.",
  request_conflict: "This request cannot be reused. Reload the directory.",
  unavailable:
    "The result is uncertain. Retry the original request to confirm it.",
};

export function MemberControls({
  member,
  isSelf,
}: {
  member: MemberSummary;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<"author" | "administrator">(
    member.role ?? "author",
  );
  const [displayName, setDisplayName] = useState(member.displayName ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MemberResult | null>(null);
  const [retryCommand, setRetryCommand] = useState<MemberCommand | null>(null);
  const busy = useRef(false);
  const blocked = pending || Boolean(retryCommand) || Boolean(result?.ok);

  async function run(command: MemberCommand) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    let next: MemberResult;
    try {
      next = await manageMembershipAction(command);
    } catch {
      next = { ok: false, code: "unavailable" };
    }
    setRetryCommand(!next.ok && next.code === "unavailable" ? command : null);
    setResult(next);
    setPending(false);
    busy.current = false;
    if (next.ok) router.refresh();
  }

  function approve() {
    if (blocked || !member.eligible) return;
    if (!displayName.trim() || displayName !== displayName.trim()) {
      setResult({ ok: false, code: "invalid_input" });
      return;
    }
    void run({
      kind: "approve",
      targetUserId: member.userId,
      requestId: crypto.randomUUID(),
      expectedVersion: member.version,
      role,
      displayName,
    });
  }

  function changeRole() {
    if (blocked || member.version === null || role === member.role) return;
    if (
      isSelf &&
      role === "author" &&
      !window.confirm(
        "Demote your own administrator account? You will lose access to administration if another eligible administrator remains.",
      )
    )
      return;
    void run({
      kind: "changeRole",
      targetUserId: member.userId,
      requestId: crypto.randomUUID(),
      expectedVersion: member.version,
      role,
    });
  }

  function deactivate() {
    if (blocked || member.version === null) return;
    if (
      !window.confirm(
        isSelf
          ? "Deactivate your own membership? You will lose dashboard access if another eligible administrator remains."
          : `Deactivate ${member.email || "this member"}? They will lose dashboard access.`,
      )
    )
      return;
    void run({
      kind: "deactivate",
      targetUserId: member.userId,
      requestId: crypto.randomUUID(),
      expectedVersion: member.version,
    });
  }

  return (
    <section aria-label={`Manage ${member.email || "member"}`}>
      {member.state === "pending" || member.state === "inactive" ? (
        <div className={styles.controls}>
          <label>
            Public display name for {member.email}
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
              required
              disabled={blocked || !member.eligible}
            />
          </label>
          <label>
            Role for {member.email}
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "author" | "administrator")
              }
              disabled={blocked || !member.eligible}
            >
              <option value="author">Author</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          <button
            type="button"
            onClick={approve}
            disabled={blocked || !member.eligible}
          >
            {member.state === "inactive" ? "Reactivate" : "Approve"}{" "}
            {member.email}
          </button>
          {member.state === "inactive" && member.displayName && (
            <p>The existing public profile name stays unchanged.</p>
          )}
        </div>
      ) : (
        <div className={styles.controls}>
          <label>
            Role for {member.email}
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "author" | "administrator")
              }
              disabled={blocked}
            >
              <option value="author">Author</option>
              <option value="administrator">Administrator</option>
            </select>
          </label>
          <button
            type="button"
            onClick={changeRole}
            disabled={
              blocked ||
              role === member.role ||
              (role === "administrator" && !member.eligible)
            }
          >
            Change role for {member.email}
          </button>
          <button type="button" onClick={deactivate} disabled={blocked}>
            Deactivate {member.email}
          </button>
        </div>
      )}
      {pending && <p role="status">Saving membership…</p>}
      {result?.ok && <p role="status">Membership saved. Refreshing…</p>}
      {result && !result.ok && (
        <div role="alert">
          <p>{messages[result.code]}</p>
          {retryCommand && (
            <button
              type="button"
              onClick={() => void run(retryCommand)}
              disabled={pending}
            >
              Retry original request
            </button>
          )}
          {(result.code === "conflict" ||
            result.code === "request_conflict" ||
            result.code === "not_found") && (
            <button type="button" onClick={() => router.refresh()}>
              Reload memberships
            </button>
          )}
        </div>
      )}
      <noscript>Enable JavaScript to change memberships.</noscript>
    </section>
  );
}
