"use client";

import type { PointerEvent, ReactNode } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A Card with a soft accent glow that follows the pointer.
 *
 * The pointer position is written straight to CSS custom properties on the element
 * (--spot-x / --spot-y), not to React state, so moving the mouse never re-renders.
 * The glow only fades in on hover, and Tailwind's `hover:` variant applies only on devices
 * that can hover, so touch screens never get a stuck glow. It's decoration only: the
 * layer is aria-hidden and ignores pointer events.
 */
export function SpotlightCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  };

  return (
    <Card
      padded={false}
      onPointerMove={onPointerMove}
      className="group relative h-full overflow-hidden transition-colors duration-150 hover:border-line-strong"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 spotlight opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] spotlight-border opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
      <div className={cn("relative p-4 sm:p-5", className)}>{children}</div>
    </Card>
  );
}
