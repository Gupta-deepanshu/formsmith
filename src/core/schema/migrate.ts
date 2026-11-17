import { SCHEMA_VERSION, type FormDefinition } from "./definition";
import { validateForm } from "./validateForm";
import type { FormIssue } from "./issues";

/**
 * Load a stored definition of any known schemaVersion and bring it up to the current one.
 *
 * Stored JSON outlives code: form_versions are immutable, so a v1 form published today
 * must still load after the schema moves to v2. Each migration is a pure function
 * vN -> vN+1, run in sequence. There is only v1 so far; the table is the extension point.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (raw) => ({ ...raw, schemaVersion: 2, ... }),
};

export function migrateToCurrent(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  let doc = raw as Record<string, unknown>;
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : SCHEMA_VERSION;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    doc = step(doc);
    version++;
  }
  return doc;
}

export function loadForm(raw: unknown): { ok: true; form: FormDefinition; issues: FormIssue[] } | { ok: false; issues: FormIssue[] } {
  return validateForm(migrateToCurrent(raw));
}
