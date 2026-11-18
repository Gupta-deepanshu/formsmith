"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import type { DayCount, PeriodChange } from "@/core";
import { cn } from "@/lib/cn";

/**
 * KPI tile (pattern from Bklit's stat cards): label · headline value · optional delta badge
 * vs a named period · optional sparkline · optional meter. Hand-built; no chart library.
 *
 * - The value counts up from its previous value (0 on first mount) with an ease-out over
 *   ~600 ms. The animated digits are aria-hidden; the real value is in visually hidden
 *   text, so screen readers never hear intermediate numbers. Reduced motion: no count-up.
 * - Delta colour = direction × "up is good" (responses: up is good), always with an arrow
 *   icon and a signed label, never colour alone.
 * - Sparkline: the previous period in a recessive grey, the current period in the accent,
 *   so the comparison the badge states is visible. Decorative: the numbers it shows are
 *   in the badge text and in the chart/table below it.
 */

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en");
const fmt = (n: number, format: "number" | "percent") =>
  format === "percent"
    ? `${Math.round(n * 100)}%`
    : n >= 10_000
      ? compact.format(n)
      : whole.format(Math.round(n));

function useCountUp(target: number, durationMs = 600) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      const id = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const value = start + (target - start) * eased;
      from.current = value;
      setShown(value);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return shown;
}

export type StatTrend = {
  /** Daily counts, oldest first; the last `period` days are "current". */
  daily: DayCount[];
  period: number;
  change: PeriodChange;
  /** Shown under the sparkline, e.g. "Last 7 days vs the 7 before" */
  periodLabel: string;
};

export function StatTile({
  label,
  value,
  format = "number",
  ratio,
  detail,
  trend,
}: {
  label: string;
  value: number;
  format?: "number" | "percent";
  ratio?: number;
  detail?: string;
  trend?: StatTrend;
}) {
  const shown = useCountUp(value);
  const final = fmt(value, format);

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-fg-muted">{label}</p>
        {trend ? <DeltaBadge change={trend.change} periodLabel={trend.periodLabel} /> : null}
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        <span aria-hidden="true">{fmt(shown, format)}</span>
        <span className="sr-only">{final}</span>
      </p>
      {trend ? <Sparkline daily={trend.daily} period={trend.period} /> : null}
      {trend ? <p className="text-xs text-fg-muted">{trend.periodLabel}</p> : null}
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
            className="block h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out"
            style={{ transform: `scaleX(${ratio})` }}
          />
        </span>
      ) : null}
      {detail ? <p className="text-xs text-fg-muted">{detail}</p> : null}
    </div>
  );
}

function DeltaBadge({ change, periodLabel }: { change: PeriodChange; periodLabel: string }) {
  const diff = change.current - change.previous;
  const text =
    change.change === null
      ? diff > 0
        ? `+${whole.format(diff)}`
        : "–"
      : `${change.change > 0 ? "+" : change.change < 0 ? "−" : "±"}${Math.round(Math.abs(change.change) * 100)}%`;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        tone === "up" && "bg-success-soft text-success",
        tone === "down" && "bg-danger-soft text-danger",
        tone === "flat" && "bg-subtle text-fg-muted",
      )}
    >
      {tone === "up" ? <Icon name="trendUp" className="size-3.5" /> : null}
      {tone === "down" ? <Icon name="trendDown" className="size-3.5" /> : null}
      {text}
      <span className="sr-only">
        {" "}
        {periodLabel} ({whole.format(change.current)} vs {whole.format(change.previous)})
      </span>
    </span>
  );
}

/**
 * Sparkline: two polylines sharing the boundary point. Drawn in a 100×24 viewBox stretched
 * to the tile width; `vector-effect: non-scaling-stroke` keeps the stroke at 2px anyway.
 */
function Sparkline({ daily, period }: { daily: DayCount[]; period: number }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const n = daily.length;
  const pts = daily.map(
    (d, i) => [n > 1 ? (i / (n - 1)) * 100 : 50, 22 - (d.count / max) * 20] as const,
  );
  const split = Math.max(0, n - period - 1);
  const line = (from: number, to: number) =>
    pts
      .slice(from, to)
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-8 w-full overflow-visible"
    >
      <polyline
        points={line(0, split + 1)}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={line(split, n)}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
