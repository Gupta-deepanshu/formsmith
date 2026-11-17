"use client";

import { useEffect, useRef } from "react";
import type { Field } from "@/core";
import { fieldDomId } from "./FieldControl";

/**
 * Error summary at the top of a step (GOV.UK pattern). It receives focus when it appears,
 * so screen readers read the count and list. Each item links to its field and moves focus
 * to the actual control.
 */
export function ErrorSummary({ errors, fields, focusKey }: { errors: Record<string, string>; fields: Field[]; focusKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = fields.filter((f) => errors[f.id]);

  useEffect(() => {
    if (items.length) ref.current?.focus();
    // Re-focus on every failed attempt, not only when the count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  if (!items.length) return null;

  const focusField = (id: string) => {
    const root = document.getElementById(fieldDomId(id));
    const target = root?.matches("input, select, textarea") ? root : root?.querySelector<HTMLElement>("input, select, textarea");
    target?.focus();
    root?.scrollIntoView({ block: "center" });
  };

  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="rounded-card border-2 border-danger bg-danger-soft p-4 focus-visible:outline-offset-4">
      <h2 id="error-summary-title" className="text-sm font-semibold text-danger">
        {items.length === 1 ? "There is a problem on this step" : `There are ${items.length} problems on this step`}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {items.map((f) => (
          <li key={f.id}>
            <a
              href={`#${fieldDomId(f.id)}`}
              className="text-danger underline underline-offset-2"
              onClick={(e) => {
                e.preventDefault();
                focusField(f.id);
              }}
            >
              {f.label}: {errors[f.id]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
