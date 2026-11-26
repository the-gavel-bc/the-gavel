import type { ComponentProps, ReactNode } from "react";
import { Button } from "../button/button";
import styles from "./icon-button.module.css";

/**
 * A square button showing only an icon. `label` is its accessible name and
 * the tooltip shown on hover and keyboard focus.
 */
export function IconButton({
  label,
  icon,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "aria-label"> & {
  label: string;
  icon: ReactNode;
}) {
  return (
    <Button
      {...props}
      className={[styles.iconButton, className].filter(Boolean).join(" ")}
      aria-label={label}
      data-tooltip={label}
    >
      {icon}
    </Button>
  );
}
