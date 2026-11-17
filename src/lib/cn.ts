/** Join class names, skipping falsy values. (A tiny stand-in for clsx; later classes don't override earlier ones, so callers avoid conflicts.) */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
