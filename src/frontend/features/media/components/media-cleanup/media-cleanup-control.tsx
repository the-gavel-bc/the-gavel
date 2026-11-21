"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/frontend/components/ui/button/button";
import styles from "./media-cleanup.module.css";
import { retryMediaCleanupAction } from "@/backend/media/retired-media-cleanup/cleanup-actions";
const failureMessage = {
  forbidden: "Administrator access is required to run a cleanup check.",
  environment: "Cleanup checks are unavailable in this environment.",
  failed: "Cleanup check failed. Try again.",
};

export function MediaCleanupControl() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function run() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      const result = await retryMediaCleanupAction();
      setMessage(
        result.ok
          ? "Cleanup check completed. Monitoring continues."
          : failureMessage[result.code],
      );
      if (result.ok || result.code === "failed") router.refresh();
    } catch {
      setMessage(failureMessage.failed);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.run}>
      <Button type="button" disabled={pending} onClick={() => void run()}>
        {pending ? "Checking…" : "Run cleanup check"}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
