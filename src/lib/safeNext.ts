/** Only allow same-site relative paths as post-login redirects (prevents open redirects like //evil.com). */
export function safeNextPath(next: string | null | undefined, fallback = "/forms"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
