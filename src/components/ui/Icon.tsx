import { cn } from "@/lib/cn";

/** A handful of hand-drawn 16px stroke icons. Decorative by default (aria-hidden). */
const paths = {
  plus: "M8 3v10M3 8h10",
  x: "M4 4l8 8M12 4l-8 8",
  check: "M3 8.5l3 3 7-7",
  chevronUp: "M4 10l4-4 4 4",
  chevronDown: "M4 6l4 4 4-4",
  chevronLeft: "M10 4L6 8l4 4",
  chevronRight: "M6 4l4 4-4 4",
  arrowUp: "M8 13V3M4 7l4-4 4 4",
  arrowDown: "M8 3v10M4 9l4 4 4-4",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5",
  undo: "M5.5 3.5L3 6l2.5 2.5M3 6h6.5a3.5 3.5 0 010 7H7",
  redo: "M10.5 3.5L13 6l-2.5 2.5M13 6H6.5a3.5 3.5 0 000 7H9",
  sparkle: "M8 2l1.3 3.7L13 7l-3.7 1.3L8 12l-1.3-3.7L3 7l3.7-1.3L8 2z",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  link: "M7 9a3 3 0 004.2 0l1.8-1.8a3 3 0 00-4.2-4.2L8 3.8M9 7a3 3 0 00-4.2 0L3 8.8A3 3 0 007.2 13l.8-.8",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z",
  download: "M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10",
  sun: "M8 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  moon: "M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 106.5 6.5z",
  monitor: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  pause: "M5.5 3.5v9M10.5 3.5v9",
  trendUp: "M2.5 11.5l4-4 2.5 2.5 4.5-5M10 5h3.5v3.5",
  trendDown: "M2.5 4.5l4 4 2.5-2.5 4.5 5M10 11h3.5V7.5",
  play: "M5 3.2v9.6L12.5 8 5 3.2z",
  rule: "M3 4h10M3 8h6M3 12h3M11 10l2 2-2 2",
  grip: "M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01",
  edit: "M10.5 3l2.5 2.5L6 12.5H3.5V10L10.5 3z",
  alert:
    "M8 5.5v3M8 11h.01M7.1 2.6L1.7 12a1 1 0 00.9 1.5h10.8a1 1 0 00.9-1.5L8.9 2.6a1 1 0 00-1.8 0z",
  wifiOff:
    "M2 2l12 12M5.5 8.5a4 4 0 015 0M3 6a7.5 7.5 0 012.6-1.6M13 6a7.5 7.5 0 00-4.2-2M8 12h.01",
  menu: "M3 4.5h10M3 8h10M3 11.5h10",
  form: "M3.5 2.5h9v11h-9zM5.5 5.5h5M5.5 8h5M5.5 10.5h3",
  keyboard: "M1.5 4.5h13v7h-13zM4 7h.01M6.5 7h.01M9 7h.01M11.5 7h.01M5 9.5h6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className,
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <path d={paths[name]} />
    </svg>
  );
}
