"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

/**
 * Wrapper around native <dialog>. showModal() gives us, for free: a focus trap, Escape
 * to close, inert background and top-layer stacking. We add: focus return to the
 * element that opened it, a labelled title, optional initial focus, and a drawer variant.
 */
export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "modal" | "drawer";
  /** CSS selector inside the dialog to focus on open (default: first focusable). */
  initialFocus?: string;
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "modal",
  initialFocus,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      el.showModal();
      const target = initialFocus ? el.querySelector<HTMLElement>(initialFocus) : null;
      target?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, initialFocus]);

  // Return focus to the opener whenever the dialog closes (Escape, button, or prop change).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => {
      returnTo.current?.focus?.();
      returnTo.current = null;
    };
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, []);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault(); // let the parent own the state
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      // `fs-dialog` (globals.css) animates both opening and closing with native CSS
      // transitions; no exit state is needed in React.
      data-variant={variant}
      className={cn(
        "fs-dialog m-0 max-h-none max-w-none bg-transparent p-0 text-fg open:flex",
        variant === "drawer"
          ? "ml-auto h-dvh w-full max-w-xl"
          : "m-auto w-[calc(100%-2rem)] items-center justify-center",
        variant === "modal" && widths[size],
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col border border-line bg-surface shadow-card",
          variant === "drawer" ? "h-full" : "max-h-[85dvh] rounded-card",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 rounded-control p-1 text-fg-muted hover:bg-subtle hover:text-fg"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
