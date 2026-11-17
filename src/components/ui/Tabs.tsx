"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * WAI-ARIA tabs with roving tabindex: Tab moves into the tablist once, arrows move between
 * tabs, Home/End jump to the ends. Selection follows focus (automatic activation).
 * Controlled, so the parent owns which panel is shown.
 */
export type TabItem<K extends string> = { key: K; label: ReactNode; panel: ReactNode };

export function Tabs<K extends string>({ items, value, onChange, label, className }: { items: TabItem<K>[]; value: K; onChange: (key: K) => void; label: string; className?: string }) {
  const base = useId();
  const refs = useRef(new Map<K, HTMLButtonElement>());

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === value);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const key = items[next]!.key;
    onChange(key);
    refs.current.get(key)?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                if (el) refs.current.set(t.key, el);
                else refs.current.delete(t.key);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                selected ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div key={t.key} role="tabpanel" id={`${base}-panel-${t.key}`} aria-labelledby={`${base}-tab-${t.key}`} hidden={t.key !== value} tabIndex={0} className="pt-4 focus-visible:outline-offset-4">
          {t.key === value ? t.panel : null}
        </div>
      ))}
    </div>
  );
}
