"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryMediaCleanupAction } from "@/lib/media/retired-media-cleanup/cleanup-actions";
export function MediaCleanupControl() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    if (pending) return;
    setPending(true);
    const result = await retryMediaCleanupAction();
    setMessage(
      result.ok
        ? "Cleanup check completed. Monitoring continues."
        : "Cleanup check failed. Retry and check the deployment configuration.",
    );
    setPending(false);
    router.refresh();
  }
  return (
    <>
      <button type="button" disabled={pending} onClick={() => void run()}>
        Run cleanup check
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
