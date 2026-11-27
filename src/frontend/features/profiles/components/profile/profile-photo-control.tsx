"use client";
import { shrinkImage } from "@/frontend/features/media/shrink-image/shrink-image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeProfilePhotoAction,
  saveProfilePhotoAction,
  type ProfilePhotoResult,
} from "@/backend/profiles/profile-photo/profile-photo-actions";
import { Button } from "@/frontend/components/ui/button/button";
import { IconButton } from "@/frontend/components/ui/icon-button/icon-button";
import { TrashIcon } from "@/frontend/components/ui/icons/icons";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import styles from "./profile-photo-control.module.css";

const maxBytes = 3 * 1024 * 1024;
const accepted = ["image/jpeg", "image/png", "image/webp"];
const messages: Record<string, string> = {
  invalid_type: "Choose a JPEG, PNG or WebP image.",
  invalid_image: "That image could not be read. Try a different file.",
  too_large: "Choose an image of 3 MB or less.",
  forbidden: "Your access no longer permits profile changes.",
  rate_limited: "Too many photo changes. Wait a minute, then try again.",
  unavailable: "The photo could not be saved. Try again.",
};

export function ProfilePhotoControl({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const busy = useRef(false);

  async function finish(call: () => Promise<ProfilePhotoResult>, ok: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setProblem("");
    setDone("");
    let result: ProfilePhotoResult;
    try {
      result = await call();
    } catch {
      result = { ok: false, code: "unavailable" };
    }
    busy.current = false;
    setPending(false);
    if (result.ok) {
      setDone(ok);
      router.refresh();
    } else setProblem(messages[result.code] ?? messages.unavailable);
    if (input.current) input.current.value = "";
  }

  async function upload(chosen: File | undefined) {
    if (!chosen) return;
    if (!accepted.includes(chosen.type))
      return setProblem(messages.invalid_type);
    const prepared = await shrinkImage(chosen, {
      maxSide: 1200,
      maxBytes: maxBytes - 256 * 1024,
    });
    if (!prepared.ok) return setProblem(messages.too_large);
    const file = prepared.file;
    if (file.size > maxBytes) return setProblem(messages.too_large);
    const form = new FormData();
    form.set("photo", file);
    void finish(() => saveProfilePhotoAction(form), "Photo saved.");
  }

  async function remove() {
    if (
      !(await confirm({
        title: "Remove your photo?",
        message: "Your author page will no longer show a photo.",
        confirmLabel: "Remove photo",
        cancelLabel: "Keep photo",
        danger: true,
      }))
    )
      return;
    void finish(() => removeProfilePhotoAction(), "Photo removed.");
  }

  return (
    <div className={styles.photo}>
      {photoUrl ? (
        // Same-origin processed image; next/image is not used under the CSP.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} width={96} height={96} alt={`Photo of ${name}`} />
      ) : (
        <span className={styles.placeholder} aria-hidden="true">
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <div className={styles.controls}>
        <p className={styles.title}>Profile photo</p>
        <p className={styles.hint}>
          Shown in the About section of your author page. JPEG, PNG or WebP, up
          to 3 MB; it is cropped to a square.
        </p>
        <input
          ref={input}
          id="profile-photo-file"
          className={styles.file}
          type="file"
          accept={accepted.join(",")}
          disabled={pending}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            {photoUrl ? "Replace photo" : "Add photo"}
          </Button>
          {photoUrl && (
            <IconButton
              variant="danger"
              disabled={pending}
              onClick={() => void remove()}
              label="Remove photo"
              icon={<TrashIcon />}
            />
          )}
        </div>
        {pending && <p role="status">Saving photo…</p>}
        {done && <p role="status">{done}</p>}
        {problem && <p role="alert">{problem}</p>}
      </div>
      {confirmDialog}
    </div>
  );
}
