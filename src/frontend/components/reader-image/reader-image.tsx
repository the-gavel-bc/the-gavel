"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import styles from "./reader-image.module.css";

// Alt text stays in the markup for assistive technology but is only drawn
// when the image fails to load (browsers also draw it while loading).
export function ReaderImage({
  alt,
  className,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const img = ref.current;
    // The error can fire before hydration attaches the handler.
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={ref}
      alt={alt}
      className={`${styles.image} ${failed ? styles.failed : ""} ${className ?? ""}`}
      onError={() => setFailed(true)}
    />
  );
}
