/**
 * Public env, safe for the browser. NEXT_PUBLIC_* values are inlined at build time, so
 * they must be referenced literally (process.env.NEXT_PUBLIC_X), not dynamically.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function assertPublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.");
  }
}
