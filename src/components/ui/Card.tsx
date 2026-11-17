import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  padded = true,
  ...props
}: ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        padded && "p-4 sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
const tones: Record<BadgeTone, string> = {
  neutral: "bg-subtle text-fg-muted border-line",
  accent: "bg-accent-soft text-accent-strong border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="text-fg-muted">{icon}</div> : null}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${pct}%`}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)}
    >
      <div
        className="h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}
