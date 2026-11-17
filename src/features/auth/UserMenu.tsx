"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/** Account menu built on <details>/<summary>: keyboard and screen-reader friendly with no JS for open/close. */
export function UserMenu({ name, email }: { name?: string; email?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();

  const signOut = async () => {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <details className="relative [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="grid size-8 cursor-pointer list-none place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong"
        aria-label="Account menu"
      >
        {initial}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-60 animate-fade rounded-card border border-line bg-surface p-3 shadow-card">
        <p className="truncate text-sm font-medium">{name ?? "Signed in"}</p>
        {email ? <p className="truncate text-sm text-fg-muted">{email}</p> : null}
        <Button className="mt-3 w-full" size="sm" onClick={signOut} loading={pending}>
          Sign out
        </Button>
      </div>
    </details>
  );
}
