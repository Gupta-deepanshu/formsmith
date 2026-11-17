import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Server client for Server Components and Route Handlers, acting AS THE USER (their
 * cookies, publishable key, RLS applies). Create one per request.
 *
 * Reads cookies(), so with Cache Components any component calling it must sit inside a
 * <Suspense> boundary.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. Fine: the proxy
          // refreshes the session and writes the cookies on the next request.
        }
      },
    },
  });
}

export type Claims = { sub: string; is_anonymous?: boolean; email?: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string } };

/**
 * Verified claims of the current user, or null. getClaims() checks the JWT signature
 * (unlike getSession(), which trusts the cookie), so this is safe for auth decisions.
 */
export async function getClaims(): Promise<Claims | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims as unknown as Claims;
}

/** A signed-in, non-anonymous user (a form owner), or null. */
export async function getOwner(): Promise<{ id: string; email?: string; name?: string } | null> {
  const c = await getClaims();
  if (!c || c.is_anonymous) return null;
  return { id: c.sub, email: c.email, name: c.user_metadata?.full_name ?? c.user_metadata?.name };
}
