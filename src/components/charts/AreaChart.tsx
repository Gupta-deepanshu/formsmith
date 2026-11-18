"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DayCount } from "@/core";

/**
 * Single-series area chart over days, hand-built (patterns from Bklit: low-opacity area that
 * fades towards the baseline, 2px line, horizontal gridlines only, one crosshair tooltip).
 *
 * How it's put together:
 * - The plot is an SVG in a 0..100 × 0..100 viewBox stretched to the box
 *   (preserveAspectRatio="none"), so it is fluid with no resize observer. Strokes use
 *   `vector-effect: non-scaling-stroke` to stay 1–2px; text, the marker dot and the
 *   tooltip are HTML positioned in %, so nothing is distorted by the stretch.
 * - The crosshair snaps to the nearest day (readers aim at a date, not at a 2px line).
 *   The whole plot is the hit target; arrow keys / Home / End move it for keyboard users,
 *   and the focused day is announced via a live region. Tooltips never gate: every value
 *   is in the table view.
 * - Gradient stops and strokes read our CSS tokens, so dark mode is the token set, not an
 *   automatic inversion.
 */

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" });
const parseDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** A "nice" axis top (1, 2, 5 × 10^n) and 4 gridline steps. */
function niceMax(max: number) {
  if (max <= 4) return 4;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return step * 4;
}

export function AreaChart({
  title,
  description,
  data,
  valueLabel,
}: {
  title: string;
  description?: string;
  data: DayCount[];
  /** Noun for the value, plural, e.g. "submissions". */
  valueLabel: string;
}) {
  const id = useId();
  const gradientId = `${id}-fill`;
  const [active, setActive] = useState<number | null>(null);
  // Announce only keyboard moves; a pointer sweeping the plot would flood a screen reader.
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const n = data.length;
  const top = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (v: number) => 100 - (v / top) * 100;

  const line = data
    .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(3)},${y(d.count).toFixed(3)}`)
    .join("");
  const area = `${line}L100,100L0,100Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    value: Math.round(top * t),
    at: 100 - t * 100,
  }));
  const ticks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const point = active !== null ? data[active] : undefined;
  const total = data.reduce((s, d) => s + d.count, 0);

  const nearest = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(r.width, 1)));
    return Math.round(t * (n - 1));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? n - 1;
    const next =
      e.key === "ArrowLeft"
        ? cur - 1
        : e.key === "ArrowRight"
          ? cur + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setViaKeyboard(true);
    setActive(Math.min(n - 1, Math.max(0, next)));
  };

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <figcaption>
        <p id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </p>
        {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      </figcaption>

      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        {/* Y axis labels, aligned to the gridlines. */}
        <div
          aria-hidden="true"
          className="relative h-40 w-6 text-right text-xs text-fg-muted tabular-nums"
        >
          {grid.map((g) => (
            <span
              key={g.at}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${g.at}%` }}
            >
              {g.value}
            </span>
          ))}
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`${title}. ${total} ${valueLabel} over ${n} days. Use the left and right arrow keys to read each day.`}
          onPointerMove={(e) => {
            setViaKeyboard(false);
            setActive(nearest(e));
          }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => {
            setViaKeyboard(true);
            setActive((a) => a ?? n - 1);
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="relative h-40 touch-pan-y rounded-control outline-offset-4"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.28 }} />
                <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0.02 }} />
              </linearGradient>
            </defs>
            {grid.map((g) => (
              <line
                key={g.at}
                x1="0"
                x2="100"
                y1={g.at}
                y2={g.at}
                stroke={g.at === 100 ? "var(--line-strong)" : "var(--line)"}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {active !== null ? (
              <line
                x1={x(active)}
                x2={x(active)}
                y1="0"
                y2="100"
                stroke="var(--fg-muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          {point && active !== null ? (
            <>
              {/* Marker: 10px dot with a 2px surface ring, HTML so it stays round. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
                style={{ left: `${x(active)}%`, top: `${y(point.count)}%` }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 z-10 animate-fade rounded-control border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-card"
                style={{
                  left: `${x(active)}%`,
                  transform: `translate(${x(active) > 70 ? "calc(-100% - 8px)" : "8px"}, -50%)`,
                }}
              >
                <span className="font-semibold tabular-nums text-fg">{point.count}</span>{" "}
                <span className="text-fg-muted">
                  {valueLabel} · {longFmt.format(parseDay(point.day))}
                </span>
              </span>
            </>
          ) : null}
        </div>

        {/* X axis: first, middle and last day. */}
        <div aria-hidden="true" className="col-start-2 relative mt-1 h-4 text-xs text-fg-muted">
          {ticks.map((i) => {
            const d = data[i];
            if (!d) return null;
            const align =
              i === 0 ? "translate-x-0" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2";
            return (
              <span
                key={d.day}
                className={`absolute top-0 whitespace-nowrap ${align}`}
                style={{ left: `${x(i)}%` }}
              >
                {dayFmt.format(parseDay(d.day))}
              </span>
            );
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {point && viaKeyboard
          ? `${longFmt.format(parseDay(point.day))}: ${point.count} ${valueLabel}`
          : ""}
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted hover:text-fg">View as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-line text-fg-muted">
                <th scope="col" className="py-1 font-medium">
                  Day
                </th>
                <th scope="col" className="py-1 text-right font-medium capitalize">
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 font-normal">
                    {longFmt.format(parseDay(d.day))}
                  </th>
                  <td className="py-1 text-right tabular-nums">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
