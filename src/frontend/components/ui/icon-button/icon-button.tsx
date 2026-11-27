import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../button/button";
import buttonStyles from "../button/button.module.css";
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

/** A link styled like a secondary icon button, for actions that navigate. */
export function IconLink({
  label,
  icon,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "children" | "aria-label"> & {
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      prefetch={false}
      {...props}
      className={[buttonStyles.button, styles.iconButton, className]
        .filter(Boolean)
        .join(" ")}
      data-variant="secondary"
      aria-label={label}
      data-tooltip={label}
    >
      {icon}
    </Link>
  );
}
