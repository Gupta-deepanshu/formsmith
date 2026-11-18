"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Hero background: a faint dot grid, plus an accent layer that lights up the dots around the
 * pointer (see `bg-dot-grid-hot` in globals.css).
 *
 * - Listens on the parent section, so the effect follows the cursor over the hero's text and
 *   buttons too, while the layer itself stays behind the content (-z-10, no pointer events).
 * - The pointer position goes straight into CSS custom properties: no React state, no
 *   re-renders, and the browser does the masking on the GPU.
 * - Only on devices with a fine pointer that can hover; touch screens keep the static grid.
 * - Decoration only, so aria-hidden.
 */
export function DotField({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const host = layer?.parentElement;
    if (!layer || !host || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const move = (e: PointerEvent) => {
      const r = layer.getBoundingClientRect();
      layer.style.setProperty("--dot-x", `${e.clientX - r.left}px`);
      layer.style.setProperty("--dot-y", `${e.clientY - r.top}px`);
      layer.dataset.active = "";
    };
    const leave = () => delete layer.dataset.active;

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className={cn("group pointer-events-none", className)}>
      <div className="absolute inset-0 bg-dot-grid" />
      <div className="absolute inset-0 bg-dot-grid-hot opacity-0 transition-opacity duration-150 group-data-active:opacity-100" />
    </div>
  );
}
