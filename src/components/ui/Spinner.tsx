import { cn } from "@/lib/cn";

export function Spinner({
  size = "md",
  label,
  className,
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const px = size === "sm" ? "size-4" : size === "lg" ? "size-8" : "size-5";
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex items-center", className)}>
      <svg
        className={cn(px, "animate-spin motion-reduce:animate-none")}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-control bg-subtle motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-subtle px-1.5 py-0.5 font-mono text-xs text-fg-muted">
      {children}
    </kbd>
  );
}
