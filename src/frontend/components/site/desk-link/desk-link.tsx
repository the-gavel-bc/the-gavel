"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./desk-link.module.css";

type Desk = { displayName: string; role: "author" | "administrator" };

export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

// Signed-in staff get a shortcut from the reader to their desk (dashboard).
// Readers see nothing; the dashboard still enforces access on its own.
export function DeskLink() {
  const [desk, setDesk] = useState<Desk | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session/desk", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (typeof body?.desk?.displayName === "string") setDesk(body.desk);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!desk) return null;
  const role = desk.role === "administrator" ? "administrator" : "author";
  return (
    <Link
      className={styles.desk}
      href="/dashboard"
      aria-label={`Your desk (${desk.displayName}, ${role})`}
      title={`Your desk (${desk.displayName}, ${role})`}
    >
      <span aria-hidden="true" className={styles.avatar}>
        {initials(desk.displayName) || "?"}
      </span>
      <span aria-hidden="true" className={styles.text}>
        Desk
      </span>
    </Link>
  );
}
