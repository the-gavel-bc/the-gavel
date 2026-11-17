"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/frontend/components/ui/button/button";
import styles from "./media-cleanup.module.css";
import { retryMediaCleanupAction } from "@/backend/media/retired-media-cleanup/cleanup-actions";
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
    <div className={styles.run}>
      <Button type="button" disabled={pending} onClick={() => void run()}>
        {pending ? "Checking…" : "Run cleanup check"}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
