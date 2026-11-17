"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

/**
 * Toasts. Messages render inside two persistent aria-live regions (polite / assertive)
 * so screen readers announce them; the regions exist from first render, which is what
 * makes announcements reliable. Auto-dismiss pauses while hovered or focused.
 */
export type ToastTone = "neutral" | "success" | "danger";
export type ToastInput = {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};
type ToastItem = ToastInput & { id: number };

type ToastApi = { show: (t: ToastInput) => number; dismiss: (id: number) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    return id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const polite = items.filter((t) => t.tone !== "danger");
  const assertive = items.filter((t) => t.tone === "danger");

  return (
    <ToastContext value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-2 sm:items-end"
        >
          {polite.map((t) => (
            <ToastView key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center gap-2 sm:items-end"
        >
          {assertive.map((t) => (
            <ToastView key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const duration = item.durationMs ?? (item.action ? 8000 : 4500);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(t);
  }, [paused, duration, item.id, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm animate-enter items-center gap-3 rounded-card border bg-surface px-4 py-3 text-sm shadow-card",
        item.tone === "danger"
          ? "border-danger"
          : item.tone === "success"
            ? "border-success"
            : "border-line",
      )}
    >
      {item.tone === "success" ? (
        <Icon name="check" className="text-success" />
      ) : item.tone === "danger" ? (
        <Icon name="alert" className="text-danger" />
      ) : null}
      <p className="flex-1 text-fg">{item.message}</p>
      {item.action ? (
        <button
          type="button"
          className="rounded-control px-2 py-1 font-medium text-accent hover:bg-accent-soft"
          onClick={() => {
            item.action!.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="rounded-control p-1 text-fg-muted hover:bg-subtle"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
