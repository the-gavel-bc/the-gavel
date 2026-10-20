import styles from "./button.module.css";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = [styles.button, className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
