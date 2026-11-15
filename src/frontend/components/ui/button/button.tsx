import styles from "./button.module.css";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  type = "button",
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  // "danger" marks destructive actions: outlined red, never the primary fill.
  variant?: "danger";
}) {
  const classes = [styles.button, className].filter(Boolean).join(" ");
  return (
    <button className={classes} type={type} data-variant={variant} {...props} />
  );
}
