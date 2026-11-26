import { Icon } from "@/frontend/components/site/site-icons/site-icons";
export { ArrowRightIcon } from "@/frontend/components/site/site-icons/site-icons";

// Dashboard action icons. Decorative: the control carries the accessible name.
export const ArrowLeftIcon = () => (
  <Icon>
    <path d="M20 12H5M10 7l-5 5 5 5" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const QuoteIcon = () => (
  <Icon>
    <path d="M10 7H6a2 2 0 0 0-2 2v3h5v5H4M20 7h-4a2 2 0 0 0-2 2v3h5v5h-5" />
  </Icon>
);
export const BulletListIcon = () => (
  <Icon>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" />
  </Icon>
);
export const NumberedListIcon = () => (
  <Icon>
    <path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 14.5a1.5 1.5 0 0 1 3 .5L3.5 19h3" />
  </Icon>
);
export const LineBreakIcon = () => (
  <Icon>
    <path d="M19 5v7a3 3 0 0 1-3 3H6M10 11l-4 4 4 4" />
  </Icon>
);
export const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);
export const UnlinkIcon = () => (
  <Icon>
    <path d="M15.5 12.5l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3M8.5 11.5l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3M4 4l16 16" />
  </Icon>
);
export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5-5 3 3 3-3 5 5" />
  </Icon>
);
export const ArchiveIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11h14V8M10 12h4" />
  </Icon>
);
