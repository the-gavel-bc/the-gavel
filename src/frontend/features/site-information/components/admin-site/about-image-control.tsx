"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeAboutImageAction,
  saveAboutImageAction,
  type AboutImageResult,
} from "@/backend/site-information/about-image/about-image-actions";
import { Button } from "@/frontend/components/ui/button/button";
import { useConfirm } from "@/frontend/components/ui/confirm-dialog/use-confirm";
import { ReaderImage } from "@/frontend/components/reader-image/reader-image";
import styles from "./about-image-control.module.css";

const maxBytes = 5 * 1024 * 1024;
const accepted = ["image/jpeg", "image/png", "image/webp"];
const messages: Record<string, string> = {
  invalid_type: "Choose a JPEG, PNG or WebP image.",
  invalid_image: "That image could not be read. Try a different file.",
  invalid_input:
    "Describe the image in the alt text (plain text, up to 240 characters).",
  too_large: "Choose an image of 5 MB or less.",
  forbidden: "Your administrator access no longer permits this change.",
  unavailable: "The image could not be saved. Try again.",
};

export function AboutImageControl({
  image,
}: {
  image: { alt: string; url: string } | null;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(image?.alt ?? "");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const busy = useRef(false);

  async function finish(call: () => Promise<AboutImageResult>, ok: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setProblem("");
    setDone("");
    let result: AboutImageResult;
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

  function upload(file: File | undefined) {
    if (!file) return;
    if (!alt.trim()) return setProblem(messages.invalid_input);
    if (!accepted.includes(file.type)) return setProblem(messages.invalid_type);
    if (file.size > maxBytes) return setProblem(messages.too_large);
    const form = new FormData();
    form.set("image", file);
    form.set("alt", alt);
    void finish(() => saveAboutImageAction(form), "Image saved.");
  }

  async function remove() {
    if (
      !(await confirm({
        title: "Remove the About page image?",
        message: "The About page will no longer show an image.",
        confirmLabel: "Remove image",
        cancelLabel: "Keep image",
        danger: true,
      }))
    )
      return;
    void finish(async () => {
      const result = await removeAboutImageAction();
      if (result.ok) setAlt("");
      return result;
    }, "Image removed.");
  }

  return (
    <section className={styles.control} aria-labelledby="about-image-title">
      <h2 id="about-image-title">About page image</h2>
      <p className={styles.hint}>
        Shown under the title on the About page. JPEG, PNG or WebP, up to 5 MB;
        it is resized to at most 1600 px wide. Saved immediately, separately
        from the fields above.
      </p>
      {image && (
        <ReaderImage
          className={styles.preview}
          src={image.url}
          width={480}
          height={270}
          alt={image.alt}
        />
      )}
      <label>
        Image description (alt text)
        <input
          type="text"
          value={alt}
          maxLength={240}
          disabled={pending}
          onChange={(event) => setAlt(event.target.value)}
        />
      </label>
      <input
        ref={input}
        className={styles.file}
        type="file"
        aria-label="About page image file"
        accept={accepted.join(",")}
        disabled={pending}
        onChange={(event) => upload(event.target.files?.[0])}
      />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {image ? "Replace image" : "Add image"}
        </Button>
        {image && (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => void remove()}
          >
            Remove image
          </Button>
        )}
      </div>
      {pending && <p role="status">Saving image…</p>}
      {done && <p role="status">{done}</p>}
      {problem && <p role="alert">{problem}</p>}
      {confirmDialog}
    </section>
  );
}
