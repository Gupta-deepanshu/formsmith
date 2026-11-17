import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Admin client using SUPABASE_SECRET_KEY. Bypasses RLS and column grants.
 *
 * Used ONLY by POST /api/responses/[id]/submit (see docs/PLAN.md §5a). Why: marking a
 * response "submitted" must happen only after the shared TypeScript validator has run,
 * which a Postgres policy can't do. So status/submitted_at aren't writable by any client
 * role, and only this trusted server path can set them.
 *
 * `import "server-only"` makes importing this from client code a build error, and the
 * key has no NEXT_PUBLIC_ prefix, so it is never inlined into browser bundles.
 * Adding another caller needs a stated reason in docs/decisions.md.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
