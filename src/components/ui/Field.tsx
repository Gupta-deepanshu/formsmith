"use client";

import { createContext, use, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Field wiring. <Field> renders the label, help and error and provides ids through
 * context. Input/Textarea/Select read it and set id, aria-describedby, aria-invalid
 * and required automatically, so feature code can't forget them.
 */
type FieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
};
const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  required?: boolean;
  invalid?: boolean;
}) {
  const ctx = use(FieldContext);
  const invalid =
    props.invalid ??
    (props["aria-invalid"] === true || props["aria-invalid"] === "true" || ctx?.invalid === true);
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby":
      [ctx?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined,
    "aria-invalid": invalid || undefined,
    required: props.required ?? ctx?.required,
    invalid,
  };
}

export type FieldProps = {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
};

export function Field({
  label,
  help,
  error,
  required = false,
  hideLabel = false,
  id: idProp,
  className,
  children,
}: FieldProps) {
  const auto = useId();
  const id = idProp ?? `field-${auto}`;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-medium text-fg", hideLabel && "sr-only")}>
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {help ? (
        <p id={helpId} className="text-sm text-fg-muted">
          {help}
        </p>
      ) : null}
      <FieldContext
        value={{
          id,
          describedBy: [errorId, helpId].filter(Boolean).join(" ") || undefined,
          invalid: !!error,
          required,
        }}
      >
        {children}
      </FieldContext>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-danger">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="mt-0.5 size-4 shrink-0"
        fill="currentColor"
      >
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-.75 3.5h1.5v4.5h-1.5V4.5Zm0 6h1.5V12h-1.5v-1.5Z" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

/** Group of related controls (radio group, checkboxes) with a legend. */
export function Fieldset({
  legend,
  help,
  error,
  required = false,
  hideLegend = false,
  className,
  children,
  id: idProp,
}: Omit<FieldProps, "label"> & { legend: ReactNode; hideLegend?: boolean }) {
  const auto = useId();
  const id = idProp ?? `fieldset-${auto}`;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
      aria-describedby={[errorId, helpId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={cn("mb-1.5 text-sm font-medium text-fg", hideLegend && "sr-only")}>
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>
      {help ? (
        <p id={helpId} className="-mt-1 text-sm text-fg-muted">
          {help}
        </p>
      ) : null}
      {children}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
