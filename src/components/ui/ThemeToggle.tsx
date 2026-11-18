"use client";

/*
 * Adapted from Kokonut UI "Switch Button" v2.0.0 by @dorianbaffier
 * https://kokonutui.com · https://github.com/kokonut-labs/kokonutui
 * MIT License, copyright (c) Kokonut UI. The icon morph and the circular reveal are theirs;
 * changes here are integration only (see the component comment below).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 * to whom the Software is furnished to do so, subject to the following conditions: The above
 * copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";

type Theme = "light" | "dark";
const KEY = "theme";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";
const EASE_REVEAL = "cubic-bezier(0.4, 0, 0.2, 1)";
const REVEAL_ATTR = "data-theme-reveal";
const REVEAL_STYLE_ID = "theme-reveal-style";
// Turn off the default cross-fade so only our circular clip-path animation is visible.
const REVEAL_CSS = `html[${REVEAL_ATTR}]::view-transition-old(root),html[${REVEAL_ATTR}]::view-transition-new(root){animation:none;mix-blend-mode:normal}`;

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  const at = (r: number) => ({
    x: Number((12 + r * Math.cos(rad)).toFixed(2)),
    y: Number((12 + r * Math.sin(rad)).toFixed(2)),
  });
  return { deg, from: at(7.5), to: at(10) };
});

/*
 * Each part's light look is its base class and its dark look a `dark:` class, so the server
 * render (theme unknown) matches the client. On click we snapshot the computed values, flip
 * the class, and animate from the old values to the new ones with WAAPI.
 */
const ANIMATED_PROPS = ["opacity", "scale", "translate", "filter"] as const;
type Snapshot = Map<Element, Keyframe>;

function snapshot(elements: Element[]): Snapshot {
  const map: Snapshot = new Map();
  for (const el of elements) {
    const style = getComputedStyle(el);
    const frame: Keyframe = { offset: 0 };
    for (const prop of ANIMATED_PROPS) frame[prop] = style.getPropertyValue(prop);
    map.set(el, frame);
    for (const animation of el.getAnimations()) animation.cancel();
  }
  return map;
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function timing(el: Element, toDark: boolean): KeyframeAnimationOptions {
  const { part, index = "0" } = (el as HTMLElement | SVGElement).dataset;
  const i = Number(index);
  switch (part) {
    case "ray":
      // Rays retract one after another; on the way back they wait for the bite to clear.
      return { delay: toDark ? i * 18 : 140 + i * 22, duration: 260, easing: EASE_OUT };
    case "bite":
      return { delay: toDark ? 60 : 0, duration: 380, easing: EASE_IN_OUT };
    case "disc":
      return { delay: toDark ? 40 : 0, duration: 380, easing: EASE_OUT };
    default:
      return { duration: 240, easing: EASE_OUT };
  }
}

function morph(from: Snapshot, toDark: boolean) {
  if (reducedMotion()) return;
  for (const [el, frame] of from) {
    el.animate([frame, {}], { ...timing(el, toDark), fill: "backwards" });
  }
}

let revealRunning = false;

/** Spread the new theme from the button as a growing circle (View Transitions API). */
function revealFrom(button: HTMLElement, apply: () => void) {
  const doc = document as Document & { activeViewTransition?: unknown };
  if (
    typeof doc.startViewTransition !== "function" ||
    reducedMotion() ||
    revealRunning ||
    doc.activeViewTransition
  ) {
    apply();
    return;
  }

  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement;

  if (!document.getElementById(REVEAL_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = REVEAL_STYLE_ID;
    style.textContent = REVEAL_CSS;
    document.head.appendChild(style);
  }
  root.setAttribute(REVEAL_ATTR, "");
  revealRunning = true;

  let transition: ViewTransition;
  try {
    // `apply` only flips a class on <html> (no React state), so no flushSync is needed:
    // the DOM is already in its new state when the callback returns.
    transition = doc.startViewTransition(apply);
  } catch {
    root.removeAttribute(REVEAL_ATTR);
    revealRunning = false;
    apply();
    return;
  }

  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 500, easing: EASE_REVEAL, pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {
      // Skipped or aborted (e.g. a navigation started its own transition).
    });

  transition.finished
    .catch(() => {
      // The theme is already applied by the time a transition can fail.
    })
    .finally(() => {
      root.removeAttribute(REVEAL_ATTR);
      revealRunning = false;
    });
}

/**
 * Light/dark theme switch: a sun that morphs into a moon, with the new theme spreading
 * across the page from the button.
 *
 * Integration changes from the original:
 * - Persists the choice in localStorage ("theme"), which the inline script in the root
 *   layout reads before first paint, so there's no flash on the next visit.
 * - Until the visitor clicks, nothing is stored and the site follows the OS setting
 *   (including live OS changes). After a click, their choice sticks.
 * - Colours use our tokens (surface/line/fg) and the global focus outline.
 * - The "Light"/"Dark" label is shown from the `sm` breakpoint up; on phones it's icon-only.
 * - Reduced motion or no View Transitions support: the theme switches instantly.
 * - A11y: a toggle button, "Dark theme", with aria-pressed reflecting the applied theme.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const maskId = `${useId()}-moon`;
  const iconRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  // Read after mount (for aria-pressed only), so the first client render matches the server.
  const [applied, setApplied] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setApplied(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    // No stored choice yet: keep following the OS as it changes.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(KEY);
      } catch {
        // storage blocked: treat as "no choice"
      }
      if (stored !== "light" && stored !== "dark") root.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", onOsChange);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", onOsChange);
    };
  }, []);

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    const apply = () => {
      const parts = [
        ...(iconRef.current?.querySelectorAll("[data-part]") ?? []),
        ...(labelRef.current?.querySelectorAll("[data-part]") ?? []),
      ];
      const before = snapshot(parts);
      root.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // storage blocked: the theme still applies for this page view
      }
      morph(before, next === "dark");
    };
    revealFrom(e.currentTarget, apply);
  };

  return (
    <button
      type="button"
      aria-label="Dark theme"
      aria-pressed={applied ? applied === "dark" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-[13px] font-medium text-fg shadow-card select-none",
        "transition-[background-color,border-color] duration-150 ease-out hover:border-line-strong hover:bg-subtle active:bg-subtle",
        className,
      )}
    >
      <svg
        ref={iconRef}
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={14}
        height={14}
        fill="none"
        className="pointer-events-none shrink-0 overflow-visible"
      >
        <mask id={maskId}>
          <rect x="-4" y="-4" width="32" height="32" fill="white" />
          <circle
            data-part="bite"
            cx="17"
            cy="7"
            r="7.5"
            fill="black"
            className="translate-x-[10px] -translate-y-[10px] dark:translate-x-0 dark:translate-y-0"
          />
        </mask>
        <g mask={`url(#${maskId})`}>
          <circle
            data-part="disc"
            cx="12"
            cy="12"
            r="4.75"
            fill="currentColor"
            className="origin-[12px_12px] [transform-box:view-box] dark:scale-[1.8]"
          />
        </g>
        <g stroke="currentColor" strokeLinecap="round" strokeWidth="2">
          {RAYS.map((ray, index) => (
            <line
              key={ray.deg}
              data-part="ray"
              data-index={index}
              x1={ray.from.x}
              y1={ray.from.y}
              x2={ray.to.x}
              y2={ray.to.y}
              className="origin-[12px_12px] [transform-box:view-box] dark:scale-50 dark:opacity-0"
            />
          ))}
        </g>
      </svg>
      <span ref={labelRef} aria-hidden="true" className="hidden leading-none sm:grid">
        <span data-part="label" className="col-start-1 row-start-1 dark:opacity-0 dark:blur-[3px]">
          Light
        </span>
        <span
          data-part="label"
          className="col-start-1 row-start-1 opacity-0 blur-[3px] dark:opacity-100 dark:blur-none"
        >
          Dark
        </span>
      </span>
    </button>
  );
}
