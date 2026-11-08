import styles from "../button/button.module.css";
import Link from "next/link";
import type { ComponentProps } from "react";

export function LinkButton({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  const classes = [styles.button, className].filter(Boolean).join(" ");
  return <Link className={classes} {...props} />;
}
