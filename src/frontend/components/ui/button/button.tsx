import styles from "./button.module.css";
import type { ComponentPropsWithRef } from "react";

export function Button({
  className,
  type = "button",
  variant,
  ...props
}: ComponentPropsWithRef<"button"> & {
  // "danger" marks destructive actions: outlined red, never the primary fill.
  // "secondary" is the quiet outlined style for the lesser of two actions.
  variant?: "danger" | "secondary";
}) {
  const classes = [styles.button, className].filter(Boolean).join(" ");
  return (
    <button className={classes} type={type} data-variant={variant} {...props} />
  );
}
