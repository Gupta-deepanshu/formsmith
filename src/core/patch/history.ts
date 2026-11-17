import type { PatchOp } from "./ops";

/**
 * Undo/redo history, shared by manual and AI edits.
 *
 * Each entry stores the forward ops and their inverse (computed at apply time).
 * Undo applies `inverse`; redo re-applies `ops`. Because both manual edits and accepted
 * AI patches are entries in the same stack, Ctrl+Z works across both.
 */
export type HistoryEntry = {
  ops: PatchOp[];
  inverse: PatchOp[];
  source: "manual" | "ai";
  label: string;
  at: number;
  /** Entries with the same key recorded within the window merge (e.g. typing a label). */
  coalesceKey?: string;
};

export type History = { past: HistoryEntry[]; future: HistoryEntry[] };

export const EMPTY_HISTORY: History = { past: [], future: [] };
export const HISTORY_LIMIT = 200;
export const COALESCE_WINDOW_MS = 600;

export function record(
  history: History,
  entry: HistoryEntry,
  windowMs = COALESCE_WINDOW_MS,
): History {
  const last = history.past.at(-1);
  if (
    last &&
    entry.coalesceKey &&
    last.coalesceKey === entry.coalesceKey &&
    entry.at - last.at <= windowMs
  ) {
    const merged: HistoryEntry = {
      ...last,
      ops: [...last.ops, ...entry.ops],
      inverse: [...entry.inverse, ...last.inverse], // undo newest first
      at: entry.at,
    };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const past = [...history.past, entry];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

/** Pop the entry to undo. The caller applies `entry.inverse`, then calls `afterUndo`. */
export function peekUndo(history: History): HistoryEntry | undefined {
  return history.past.at(-1);
}
export function afterUndo(history: History): History {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return { past: history.past.slice(0, -1), future: [entry, ...history.future] };
}
export function peekRedo(history: History): HistoryEntry | undefined {
  return history.future[0];
}
export function afterRedo(history: History): History {
  const entry = history.future[0];
  if (!entry) return history;
  return { past: [...history.past, entry], future: history.future.slice(1) };
}

/** Coalescing key for an edit: only single-field/step property edits merge. */
export function coalesceKeyFor(ops: readonly PatchOp[]): string | undefined {
  if (ops.length !== 1) return undefined;
  const op = ops[0]!;
  if (op.op === "updateField")
    return `field:${op.fieldId}:${Object.keys(op.changes).sort().join(",")}`;
  if (op.op === "updateStep")
    return `step:${op.stepId}:${Object.keys(op.changes).sort().join(",")}`;
  if (op.op === "updateForm") return `form:${Object.keys(op.changes).sort().join(",")}`;
  return undefined;
}
