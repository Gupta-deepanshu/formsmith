import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui";

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-control font-semibold tracking-tight text-fg"
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-control bg-accent text-sm text-on-accent"
      >
        F
      </span>
      Formsmith
    </Link>
  );
}

/**
 * Static header: logo, optional nav/actions, theme toggle. Session-dependent parts are passed in as children.
 *
 * `relative z-30`: backdrop-blur makes the header its own stacking context, so the account
 * menu's z-index only counts inside it. Without a z-index on the header itself, later
 * positioned content (the landing hero is `relative isolate`) paints over the open menu
 * and swallows its clicks.
 */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-30 border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
