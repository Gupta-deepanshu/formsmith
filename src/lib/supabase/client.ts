"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Browser client (singleton inside @supabase/ssr). Uses the publishable key; RLS does the rest. */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey);
}

/**
 * Make sure there is a session: reuse the current one (owner or anonymous) or start an
 * anonymous one. Used by the public form and the sandbox editor. Returns the user id.
 */
export async function ensureSession(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) throw error ?? new Error("Couldn't start a session");
  return anon.user.id;
}
