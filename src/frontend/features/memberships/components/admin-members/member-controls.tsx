"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberSummary } from "@/backend/memberships/member-directory/member-directory";
import { manageMembershipAction } from "@/backend/memberships/member-command/member-actions";
import { manageInvitationAction } from "@/backend/memberships/invitation-command/invitation-actions";
import { newStaffDisplayNameSchema } from "@/shared/memberships/member-command/member-command";
import { Button } from "@/frontend/components/ui/button/button";
import { IconButton } from "@/frontend/components/ui/icon-button/icon-button";
import { TrashIcon } from "@/frontend/components/ui/icons/icons";
import {
  STAFF_ROLE_OPTIONS,
  staffRoleLabels,
  type StaffRole,
} from "@/shared/memberships/staff-roles/staff-roles";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import styles from "./admin-members.module.css";

type Role = StaffRole;
type Failure =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "last_administrator"
  | "request_conflict"
  | "unavailable";
const messages: Record<Failure, string> = {
  invalid_input: "Check the name and role, then try again.",
  forbidden: "Your administrator access no longer permits this change.",
  not_found: "This person is no longer available.",
  conflict: "This changed elsewhere. Reload to see its current state.",
  last_administrator: "At least one eligible administrator must remain active.",
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
  const { confirm, confirmDialog } = useConfirm();
  const [role, setRole] = useState<Role>(member.role);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const busy = useRef(false);
  const blocked = pending || done || Boolean(retry);

  // Every change runs once at a time; an uncertain result keeps the original
  // request (same id) so a retry replays instead of repeating it.
  async function run(call: () => Promise<{ ok: boolean; code?: Failure }>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    let result: { ok: boolean; code?: Failure };
    try {
      result = await call();
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    setPending(false);
    busy.current = false;
    if (result.ok) {
      setRetry(null);
      setDone(true);
      router.refresh();
      return;
    }
    setFailure(result.code ?? "unavailable");
    setRetry(result.code === "unavailable" ? () => () => run(call) : null);
  }
  const requestId = () => crypto.randomUUID();

  async function save() {
    if (blocked || role === member.role) return;
    if (
      role === "administrator" &&
      !(await confirm({
        title: "Grant Administrator access?",
        message: `${member.email} will be able to manage staff access.`,
        confirmLabel: "Grant access",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    if (
      isSelf &&
      role !== "administrator" &&
      !(await confirm({
        title: "Demote your own account?",
        message:
          "You will lose access to administration if another eligible administrator remains.",
        confirmLabel: "Demote me",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    const id = requestId();
    if (member.state === "invited" && member.invitationId)
      void run(() =>
        manageInvitationAction({
          kind: "changeRole",
          requestId: id,
          invitationId: member.invitationId!,
          expectedVersion: member.version,
          role,
        }),
      );
    else if (member.userId)
      void run(() =>
        manageMembershipAction({
          kind: "changeRole",
          targetUserId: member.userId!,
          requestId: id,
          expectedVersion: member.version,
          role,
        }),
      );
  }

  async function remove() {
    if (blocked) return;
    const id = requestId();
    if (member.state === "invited" && member.invitationId) {
      if (
        !(await confirm({
          title: "Remove from the staff list?",
          message: `${member.email} will not get access when they sign in.`,
          confirmLabel: "Remove",
          cancelLabel: "Cancel",
          danger: true,
        }))
      )
        return;
      void run(() =>
        manageInvitationAction({
          kind: "remove",
          requestId: id,
          invitationId: member.invitationId!,
          expectedVersion: member.version,
        }),
      );
    } else if (member.userId) {
      if (
        !(await confirm({
          title: isSelf
            ? "Deactivate your own membership?"
            : "Deactivate this member?",
          message: isSelf
            ? "You will lose dashboard access if another eligible administrator remains."
            : `${member.email || "This member"} will lose dashboard access.`,
          confirmLabel: "Deactivate",
          cancelLabel: "Cancel",
          danger: true,
        }))
      )
        return;
      void run(() =>
        manageMembershipAction({
          kind: "deactivate",
          targetUserId: member.userId!,
          requestId: id,
          expectedVersion: member.version,
        }),
      );
    }
  }

  async function reactivate() {
    if (blocked || !member.userId || !member.eligible) return;
    const currentName = newStaffDisplayNameSchema.safeParse(member.displayName);
    const name = currentName.success
      ? currentName
      : newStaffDisplayNameSchema.safeParse(member.email.split("@")[0]);
    if (
      role === "administrator" &&
      !(await confirm({
        title: "Reactivate as Administrator?",
        message: `${member.email} will regain full staff administration access.`,
        confirmLabel: "Reactivate",
        cancelLabel: "Cancel",
        danger: true,
      }))
    )
      return;
    void run(() =>
      manageMembershipAction({
        kind: "approve",
        targetUserId: member.userId!,
        requestId: requestId(),
        expectedVersion: member.version,
        role,
        displayName: name.success ? name.data : "Staff member",
      }),
    );
  }

  const inactive = member.state === "inactive";
  return (
    <div
      className={styles.controls}
      role="group"
      aria-label={`Manage ${member.email}`}
    >
      <select
        aria-label={`Role for ${member.email}`}
        value={role}
        onChange={(event) => setRole(event.target.value as Role)}
        disabled={blocked}
      >
        {STAFF_ROLE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {staffRoleLabels[option]}
          </option>
        ))}
      </select>
      {inactive ? (
        <Button
          type="button"
          variant="secondary"
          onClick={reactivate}
          disabled={blocked || !member.eligible}
          aria-label={`Reactivate ${member.email}`}
        >
          Reactivate
        </Button>
      ) : (
        <>
          {role !== member.role && (
            <Button
              type="button"
              onClick={() => void save()}
              disabled={
                blocked || (role === "administrator" && !member.eligible)
              }
              aria-label={`Change role for ${member.email}`}
            >
              Save role
            </Button>
          )}
          {member.state === "invited" ? (
            <IconButton
              variant="danger"
              onClick={() => void remove()}
              disabled={blocked}
              label={`Remove ${member.email}`}
              icon={<TrashIcon />}
            />
          ) : (
            <Button
              type="button"
              variant="danger"
              onClick={() => void remove()}
              disabled={blocked}
              aria-label={`Deactivate ${member.email}`}
            >
              Deactivate
            </Button>
          )}
        </>
      )}
      {confirmDialog}
      {pending && <p role="status">Saving…</p>}
      {done && <p role="status">Saved. Refreshing…</p>}
      {failure && (
        <div role="alert" className={styles.problem}>
          <p>{messages[failure]}</p>
          {retry && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void retry()}
              disabled={pending}
            >
              Retry original request
            </Button>
          )}
          {(failure === "conflict" ||
            failure === "request_conflict" ||
            failure === "not_found") && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.refresh()}
            >
              Reload memberships
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
