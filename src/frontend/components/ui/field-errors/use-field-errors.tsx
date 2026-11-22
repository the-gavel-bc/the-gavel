"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./field-errors.module.css";

export function useFieldErrors() {
  const id = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nextFocus = useRef<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useLayoutEffect(() => {
    nextFocus.current?.focus();
    nextFocus.current = null;
  }, [errors]);

  return {
    show(form: HTMLFormElement, errors: Record<string, string>) {
      const [name, message] = Object.entries(errors)[0] ?? [];
      const first = name ? form.elements.namedItem(name) : null;
      nextFocus.current = first instanceof HTMLElement ? first : null;
      setAnnouncement(first && first === document.activeElement ? message : "");
      setErrors(errors);
    },
    clear(name: string) {
      if (errors[name]) setAnnouncement("");
      setErrors((current) => {
        if (!current[name]) return current;
        const remaining = { ...current };
        delete remaining[name];
        return remaining;
      });
    },
    input(name: string) {
      return {
        name,
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? `${id}-${name}` : undefined,
      };
    },
    messages: (
      <>
        <p aria-live="assertive" className={styles.announcement}>
          {announcement}
        </p>
        {Object.keys(errors).length > 0 && (
          <ul>
            {Object.entries(errors).map(([name, message]) => (
              <li key={name} id={`${id}-${name}`}>
                {message}
              </li>
            ))}
          </ul>
        )}
      </>
    ),
  };
}
