import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui";

/** Minimal, mobile-first frame for respondents: content first, light chrome. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      <footer className="mx-auto flex w-full max-w-xl items-center justify-between px-4 py-6 text-xs text-fg-muted">
        <span>
          Made with{" "}
          <Link href="/" className="font-medium underline-offset-2 hover:underline">
            Formsmith
          </Link>
        </span>
        <ThemeToggle />
      </footer>
    </div>
  );
}
