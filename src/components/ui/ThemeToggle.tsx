"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: theme still applies for this page view
  }
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (read() === "system") apply("system");
  };
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onChange);
  };
}

const OPTIONS: { value: Theme; label: string; icon: "monitor" | "sun" | "moon" }[] = [
  { value: "system", label: "System theme", icon: "monitor" },
  { value: "light", label: "Light theme", icon: "sun" },
  { value: "dark", label: "Dark theme", icon: "moon" },
];

/** Three-way segmented control (radio semantics) for system / light / dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("inline-flex rounded-control border border-line bg-surface p-0.5", className)}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => apply(o.value)}
          className={cn(
            "rounded-[calc(var(--radius-control)-2px)] p-1.5 text-fg-muted transition-colors duration-150",
            theme === o.value ? "bg-subtle text-fg" : "hover:text-fg",
          )}
        >
          <Icon name={o.icon} />
        </button>
      ))}
    </div>
  );
}
