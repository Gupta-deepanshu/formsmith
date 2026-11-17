import type { Condition, Field } from "../schema/definition";
import { createId } from "../schema/ids";
import type { NormalizedForm } from "./normalized";
import { locateField } from "./normalized";
import type { PatchOp } from "./ops";

/**
 * Higher-level edits built from primitive ops. Each returns a list of ops that the
 * caller applies as ONE transaction, so a single undo reverts all of it.
 */

function stripRefs(
  cond: Condition | undefined,
  removed: ReadonlySet<string>,
): { changed: boolean; next: Condition | undefined } {
  if (!cond) return { changed: false, next: undefined };
  const key = "all" in cond ? "all" : "any";
  const clauses = "all" in cond ? cond.all : cond.any;
  const kept = clauses.filter((c) => !removed.has(c.fieldId));
  if (kept.length === clauses.length) return { changed: false, next: cond };
  if (kept.length === 0) return { changed: true, next: undefined };
  return { changed: true, next: (key === "all" ? { all: kept } : { any: kept }) as Condition };
}

/** Ops that remove rule clauses referring to any of `removedFieldIds` (rules elsewhere in the form). */
export function dropReferencesOps(
  nf: NormalizedForm,
  removedFieldIds: ReadonlySet<string>,
): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const stepId of nf.stepOrder) {
    const step = nf.steps[stepId]!;
    const s = stripRefs(step.visibleIf, removedFieldIds);
    if (s.changed) ops.push({ op: "updateStep", stepId, changes: { visibleIf: s.next } });
    for (const fid of step.fieldIds) {
      if (removedFieldIds.has(fid)) continue;
      const f = stripRefs(nf.fields[fid]!.visibleIf, removedFieldIds);
      if (f.changed) ops.push({ op: "updateField", fieldId: fid, changes: { visibleIf: f.next } });
    }
  }
  return ops;
}

export function removeFieldOps(nf: NormalizedForm, fieldId: string): PatchOp[] {
  return [...dropReferencesOps(nf, new Set([fieldId])), { op: "removeField", fieldId }];
}

export function removeStepOps(nf: NormalizedForm, stepId: string): PatchOp[] {
  const step = nf.steps[stepId];
  if (!step) return [];
  return [...dropReferencesOps(nf, new Set(step.fieldIds)), { op: "removeStep", stepId }];
}

/** Copy a field (new ids for it and its options) directly below the original. */
export function duplicateFieldOps(
  nf: NormalizedForm,
  fieldId: string,
): { ops: PatchOp[]; newId: string } | null {
  const loc = locateField(nf, fieldId);
  const field = nf.fields[fieldId];
  if (!loc || !field) return null;
  const copy = structuredClone(field) as Field;
  copy.id = createId("f");
  copy.label = `${field.label} (copy)`.slice(0, 300);
  if ("options" in copy) copy.options = copy.options.map((o) => ({ ...o, id: createId("o") }));
  return {
    ops: [{ op: "addField", stepId: loc.stepId, index: loc.index + 1, field: copy }],
    newId: copy.id,
  };
}

/** Move a field one position up/down, crossing into the neighbouring step at the edges. */
export function nudgeFieldOps(nf: NormalizedForm, fieldId: string, direction: -1 | 1): PatchOp[] {
  const loc = locateField(nf, fieldId);
  if (!loc) return [];
  const step = nf.steps[loc.stepId]!;
  const target = loc.index + direction;
  if (target >= 0 && target < step.fieldIds.length) {
    return [{ op: "moveField", fieldId, toStepId: loc.stepId, toIndex: target }];
  }
  // At an edge: move into the adjacent questions step (end of previous / start of next).
  let si = nf.stepOrder.indexOf(loc.stepId) + direction;
  while (si >= 0 && si < nf.stepOrder.length && nf.steps[nf.stepOrder[si]!]!.kind === "review")
    si += direction;
  const neighbourId = nf.stepOrder[si];
  if (!neighbourId) return [];
  const neighbour = nf.steps[neighbourId]!;
  return [
    {
      op: "moveField",
      fieldId,
      toStepId: neighbourId,
      toIndex: direction === -1 ? neighbour.fieldIds.length : 0,
    },
  ];
}

export function nudgeStepOps(nf: NormalizedForm, stepId: string, direction: -1 | 1): PatchOp[] {
  const from = nf.stepOrder.indexOf(stepId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= nf.stepOrder.length) return [];
  return [{ op: "moveStep", stepId, toIndex: to }];
}
