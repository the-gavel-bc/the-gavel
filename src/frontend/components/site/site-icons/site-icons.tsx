import type { SVGProps } from "react";

// Decorative only: every use sits next to visible text or an accessible name.
export function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const MailIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icon>
);
export const ArrowRightIcon = () => (
  <Icon>
    <path d="M4 12h15M14 7l5 5-5 5" />
  </Icon>
);
export const InstagramIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </Icon>
);
export const SpotifyIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M7 9.5c3.5-1 7-.6 10 1M7.5 12.8c3-.8 5.8-.4 8.2.9M8 15.8c2.3-.6 4.5-.3 6.4.7" />
  </Icon>
);
export const LinkedInIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M8 10.5V17M8 7.5v.01M12 17v-6.5M12 13.5c0-1.8 1-3 2.5-3s2.5 1 2.5 3V17" />
  </Icon>
);
export const FacebookIcon = () => (
  <Icon>
    <path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.5V4.3A20 20 0 0 0 15.4 4c-2.3 0-3.9 1.4-3.9 4v2.5H9v3h2.5V21" />
  </Icon>
);
