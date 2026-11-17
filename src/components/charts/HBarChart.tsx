"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Horizontal bar chart in plain HTML/CSS (no chart library).
 * - Single series: one accent fill on a lighter track; 4px rounded data-end anchored to
 *   the baseline; 2px gap between bars; values directly labelled in text colour.
 * - Every bar is focusable and shows a tooltip on hover AND focus; tooltips never gate:
 *   each value is also in the direct label and in the data table below.
 */
export type BarRow = { key: string; label: string; value: number; note?: string };

const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

export function HBarChart({
  title,
  description,
  rows,
  total,
  valueLabel = "Responses",
  className,
}: {
  title: string;
  description?: string;
  rows: BarRow[];
  total: number;
  valueLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <figure className={cn("flex flex-col gap-3", className)} aria-labelledby={`${id}-title`}>
      <figcaption>
        <p id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </p>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </figcaption>

      <ul
        className="flex flex-col gap-0.5"
        aria-label={`${title}, ${valueLabel.toLowerCase()} per item`}
      >
        {rows.map((r) => {
          const share = pct(r.value, total);
          const isActive = active === r.key;
          return (
            <li
              key={r.key}
              tabIndex={0}
              aria-label={`${r.label}${r.note ? ` (${r.note})` : ""}: ${r.value.toLocaleString("en")}, ${share}%`}
              onPointerEnter={() => setActive(r.key)}
              onPointerLeave={() => setActive((a) => (a === r.key ? null : a))}
              onFocus={() => setActive(r.key)}
              onBlur={() => setActive((a) => (a === r.key ? null : a))}
              className="relative grid grid-cols-[minmax(6rem,38%)_1fr_auto] items-center gap-3 rounded-control px-1 py-1.5 outline-offset-0 hover:bg-subtle"
            >
              <span className="truncate text-sm text-fg" title={r.label}>
                {r.label}
                {r.note ? <span className="ml-1 text-xs text-fg-muted">{r.note}</span> : null}
              </span>
              <span aria-hidden="true" className="h-3 overflow-hidden rounded-r bg-accent-soft">
                <span
                  className={cn(
                    "block h-full origin-left rounded-r-[4px] bg-accent transition-[transform,filter] duration-200",
                    isActive && "brightness-110",
                  )}
                  style={{ transform: `scaleX(${r.value / max})` }}
                />
              </span>
              <span aria-hidden="true" className="w-20 text-right text-sm tabular-nums text-fg">
                {r.value.toLocaleString("en")} <span className="text-fg-muted">· {share}%</span>
              </span>
              {isActive ? (
                <span
                  role="presentation"
                  className="pointer-events-none absolute -top-9 left-1/3 z-10 animate-fade rounded-control border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-card"
                >
                  <span className="font-medium">{r.label}</span> · {r.value.toLocaleString("en")}{" "}
                  {valueLabel.toLowerCase()} ({share}% of {total.toLocaleString("en")})
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">View as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-line text-fg-muted">
              <th scope="col" className="py-1 font-medium">
                Item
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {valueLabel}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 font-normal">
                  {r.label}
                </th>
                <td className="py-1 text-right tabular-nums">{r.value.toLocaleString("en")}</td>
                <td className="py-1 text-right tabular-nums">{pct(r.value, total)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Stat tile with a meter: label, headline value, and a thin bar for the ratio. */
export function StatTile({
  label,
  value,
  ratio,
  detail,
}: {
  label: string;
  value: string;
  ratio?: number;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {ratio !== undefined ? (
        <span
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          className="block h-2 overflow-hidden rounded-full bg-accent-soft"
        >
          <span
            className="block h-full origin-left rounded-full bg-accent"
            style={{ transform: `scaleX(${ratio})` }}
          />
        </span>
      ) : null}
      {detail ? <p className="text-xs text-fg-muted">{detail}</p> : null}
    </div>
  );
}
