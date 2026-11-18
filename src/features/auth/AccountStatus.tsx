"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserMenu } from "./UserMenu";

type Account = { name?: string; email?: string } | null;

/**
 * Header account slot for the public pages (landing, demo, sign-in): "My forms" + the
 * account menu when an owner is signed in, otherwise a "Sign in" link.
 *
 * Why client-side: those pages are static (prerendered) under Cache Components; reading
 * cookies on the server would make every one of them dynamic. The browser client knows
 * the session from its cookie, and onAuthStateChange keeps this in sync (sign in, sign
 * out, token refresh, other tabs).
 *
 * This is DISPLAY ONLY. It doesn't verify the JWT, and it doesn't need to: every
 * authorisation decision still happens on the server (proxy + getClaims()) and in RLS.
 * Anonymous sessions (respondents, sandbox) count as signed out here.
 *
 * Until the session is known, an invisible placeholder of the link's size is rendered, so
 * the server HTML and the first client render match and the header doesn't jump.
 */
export function AccountStatus() {
  const [account, setAccount] = useState<Account | "loading">("loading");

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user || user.is_anonymous) return setAccount(null);
      const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
      setAccount({ name: meta?.full_name ?? meta?.name, email: user.email });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (account === "loading") {
    return (
      <span aria-hidden="true" className="invisible px-2 py-1 text-sm font-medium">
        Sign in
      </span>
    );
  }
  if (!account) {
    return (
      <Link
        href="/sign-in"
        className="rounded-control px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg"
      >
        Sign in
      </Link>
    );
  }
  return (
    <>
      <nav aria-label="Main">
        <Link
          href="/forms"
          className="rounded-control px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg"
        >
          My forms
        </Link>
      </nav>
      <UserMenu name={account.name} email={account.email} />
    </>
  );
}
