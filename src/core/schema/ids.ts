/**
 * Ids are short, stable strings. They survive reorders and edits, so rules, answers,
 * patches and undo history refer to ids, never array positions.
 */
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random id like `f_k3j9x2ab`. Uses Web Crypto, available in browsers, Node 22+ and edge runtimes. */
export function createId(prefix: "f" | "s" | "o" | "form"): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Turn arbitrary text (e.g. an AI-suggested key or a label) into a valid id, or null if nothing usable remains. */
export function toIdLike(raw: string, prefix: string): string | null {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^[^A-Za-z]+/, "")
    .replace(/_+/g, "_")
    .replace(/_$/, "")
    .slice(0, 48);
  if (!cleaned) return null;
  const id = cleaned.startsWith(`${prefix}_`) ? cleaned : `${prefix}_${cleaned}`;
  return ID_PATTERN.test(id) ? id.slice(0, 64) : null;
}
