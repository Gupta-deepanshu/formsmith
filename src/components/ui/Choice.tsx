"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Checkbox and radio built on native inputs (keyboard and form semantics for free),
 * styled as roomy, tappable rows for mobile.
 */

const rowClasses =
  "group flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-sm transition-colors duration-150 hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

const boxClasses = "size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-none";

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className={cn(rowClasses, className)}>
      <input type="checkbox" id={props.id ?? id} className={boxClasses} {...props} />
      <span className="flex flex-col">
        <span className="text-fg">{label}</span>
        {description ? <span className="text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode };

/** Use inside <Fieldset>. Arrow-key navigation comes from native radios sharing a name. */
export function RadioGroup({
  name,
  options,
  value,
  onChange,
  onBlur,
  disabled,
  layout = "stack",
  invalid,
  ref,
}: {
  name: string;
  options: RadioOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  layout?: "stack" | "inline";
  invalid?: boolean;
  /** Receives the first radio, so form libraries can focus the group on error. */
  ref?: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className={cn("flex gap-2", layout === "stack" ? "flex-col" : "flex-row flex-wrap")}>
      {options.map((o, i) => {
        const id = `${name}-${o.value}`;
        return (
          <label
            key={o.value}
            htmlFor={id}
            className={cn(
              rowClasses,
              invalid && "border-danger",
              layout === "inline" && "flex-1 justify-center",
            )}
          >
            <input
              ref={i === 0 ? ref : undefined}
              type="radio"
              id={id}
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              onBlur={onBlur}
              disabled={disabled}
              className={boxClasses}
            />
            <span className="flex flex-col">
              <span className="text-fg">{o.label}</span>
              {o.description ? <span className="text-fg-muted">{o.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span id={id} className="text-sm text-fg">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-line-strong bg-subtle",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-4 rounded-full bg-surface shadow transition-transform duration-150",
            checked ? "translate-x-5" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}
