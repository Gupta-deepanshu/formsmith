"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { useFieldControl } from "./Field";

export const controlClasses = (invalid: boolean, className?: string) =>
  cn(
    "w-full rounded-control border bg-surface px-3 text-base text-fg shadow-none transition-colors duration-150 placeholder:text-fg-muted/70 sm:text-sm",
    "hover:border-line-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0",
    "disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70",
    invalid ? "border-danger" : "border-line",
    className,
  );

type ControlExtras = { invalid?: boolean };

export function Input({ className, invalid: invalidProp, ...props }: ComponentProps<"input"> & ControlExtras) {
  const { invalid, ...a11y } = useFieldControl({ ...props, invalid: invalidProp });
  return <input {...props} {...a11y} className={controlClasses(invalid, cn("h-10", className))} />;
}

export function Textarea({ className, invalid: invalidProp, autoResize = true, ref, ...props }: ComponentProps<"textarea"> & ControlExtras & { autoResize?: boolean }) {
  const { invalid, ...a11y } = useFieldControl({ ...props, invalid: invalidProp });
  const inner = useRef<HTMLTextAreaElement | null>(null);
  // Grow with content (min 3 rows) so long answers stay visible without inner scrolling.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!autoResize || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 480)}px`;
  });
  return (
    <textarea
      rows={3}
      {...props}
      {...a11y}
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={controlClasses(invalid, cn("min-h-20 resize-y py-2 leading-relaxed", className))}
    />
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

/** Native <select>: best keyboard, screen-reader and mobile behaviour for free. */
export function Select({ className, invalid: invalidProp, options, placeholder, children, ...props }: ComponentProps<"select"> & ControlExtras & { options?: SelectOption[]; placeholder?: string }) {
  const { invalid, ...a11y } = useFieldControl({ ...props, invalid: invalidProp });
  return (
    <div className="relative">
      <select {...props} {...a11y} className={controlClasses(invalid, cn("h-10 appearance-none pr-9", className))}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m4 6 4 4 4-4" />
      </svg>
    </div>
  );
}
