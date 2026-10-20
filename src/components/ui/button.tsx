import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = ["button", className].filter(Boolean).join(" ");
  return <button className={classes} type={type} {...props} />;
}
