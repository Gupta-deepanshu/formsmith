import { LIMITS, type Field, type Step } from "../schema/definition";
import { validateForm } from "../schema/validateForm";
import { denormalize, locateField, type NormalizedForm } from "../patch/normalized";
import { applyOps, PatchError, type FieldChanges, type PatchOp } from "../patch/ops";
import { removeFieldOps, removeStepOps } from "../patch/compound";
import type { AiEditOp } from "./schemas";
import { buildCondition, buildField, emptyRefIndex, IdAllocator, registerField } from "./repair";

/**
 * Convert the model's edit ops into validated PatchOps.
 *
 * Each model op is converted against the form AS IT IS after the previous accepted ops,
 * applied, and kept only if it introduces no NEW validation errors (errors already in
 * the draft are tolerated, since the owner may be mid-edit). Rejected ops are reported,
 * not silently dropped, so the UI can say "2 of 3 changes applied".
 */

export type AiEditOutcome = {
  form: NormalizedForm;
  ops: PatchOp[];
  rejected: { index: number; reason: string }[];
  changedFieldIds: string[];
  changedStepIds: string[];
};

const lc = (s: string) => s.trim().toLowerCase();

function findField(nf: NormalizedForm, ref: string | undefined): Field | undefined {
  if (!ref) return undefined;
  return nf.fields[ref] ?? Object.values(nf.fields).find((f) => lc(f.id) === lc(ref) || lc(f.label) === lc(ref));
}
function findStepId(nf: NormalizedForm, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (nf.steps[ref]) return ref;
  return nf.stepOrder.find((id) => lc(id) === lc(ref) || lc(nf.steps[id]!.title) === lc(ref));
}
function lastQuestionsStep(nf: NormalizedForm): string | undefined {
  return [...nf.stepOrder].reverse().find((id) => nf.steps[id]!.kind === "questions");
}

function refIndexFor(nf: NormalizedForm) {
  const idx = emptyRefIndex();
  for (const sid of nf.stepOrder) for (const fid of nf.steps[sid]!.fieldIds) registerField(idx, nf.fields[fid]!);
  return idx;
}

function errorKeys(nf: NormalizedForm): Map<string, string> {
  const v = validateForm(denormalize(nf));
  const out = new Map<string, string>();
  for (const i of v.issues) if (i.severity === "error") out.set(`${i.code}|${i.targetId ?? ""}|${i.message}`, i.message);
  return out;
}

/** Diff two fields into updateField changes (undefined = remove the key). */
function fieldDiff(before: Field, after: Field): FieldChanges {
  const changes: Record<string, unknown> = {};
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "id") continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes[k] = b[k];
  }
  return changes as FieldChanges;
}

function convert(nf: NormalizedForm, op: AiEditOp, alloc: IdAllocator): PatchOp[] | string {
  const notes: string[] = [];
  switch (op.op) {
    case "addQuestion": {
      const stepId = findStepId(nf, op.stepId) ?? lastQuestionsStep(nf);
      if (!stepId || nf.steps[stepId]!.kind === "review") return "No step to add the question to.";
      const built = buildField(op.question, alloc, notes);
      if (!built) return "The new question was incomplete.";
      let field = built.field;
      const cond = buildCondition(built.rawCondition, refIndexFor(nf));
      if (cond) field = { ...field, visibleIf: cond };
      const index = op.position ?? nf.steps[stepId]!.fieldIds.length;
      return [{ op: "addField", stepId, index, field }];
    }
    case "updateQuestion": {
      const existing = findField(nf, op.questionId);
      if (!existing) return `Question "${op.questionId}" not found.`;
      if (!op.changes) return "No changes given.";
      const { showIf, ...rest } = op.changes;
      const built = buildField({ ...existing, ...rest }, alloc, notes, existing);
      if (!built) return "The change would make the question invalid.";
      let next: Field = { ...built.field };
      if (existing.visibleIf) next.visibleIf = existing.visibleIf;
      if (showIf !== undefined) {
        const cond = buildCondition(showIf, refIndexFor(nf));
        if (cond) next = { ...next, visibleIf: cond };
        else {
          const { visibleIf: _v, ...noRule } = next;
          next = noRule as Field;
        }
      }
      const changes = fieldDiff(existing, next);
      return Object.keys(changes).length ? [{ op: "updateField", fieldId: existing.id, changes }] : [];
    }
    case "removeQuestion": {
      const f = findField(nf, op.questionId);
      return f ? removeFieldOps(nf, f.id) : `Question "${op.questionId}" not found.`;
    }
    case "moveQuestion": {
      const f = findField(nf, op.questionId);
      if (!f) return `Question "${op.questionId}" not found.`;
      const toStepId = findStepId(nf, op.targetStepId) ?? locateField(nf, f.id)!.stepId;
      return [{ op: "moveField", fieldId: f.id, toStepId, toIndex: Math.max(0, op.position ?? nf.steps[toStepId]!.fieldIds.length) }];
    }
    case "addStep": {
      const s = op.step;
      const title = s?.title?.trim().slice(0, LIMITS.titleMax);
      if (!title) return "The new step needs a title.";
      const step: Step = { id: alloc.take(s?.id, title, "s"), title, kind: s?.kind === "review" && !s.questions?.length ? "review" : "questions", fields: [] };
      if (s?.description) step.description = s.description.slice(0, LIMITS.helpMax);
      const idx = refIndexFor(nf);
      const cond = buildCondition(s?.showIf, idx);
      if (cond) step.visibleIf = cond;
      for (const q of s?.questions ?? []) {
        const built = buildField(q, alloc, notes);
        if (!built) continue;
        const qc = buildCondition(built.rawCondition, idx);
        const field = qc ? { ...built.field, visibleIf: qc } : built.field;
        step.fields.push(field);
        registerField(idx, field, built.rawId);
      }
      // Default position: before a trailing review step.
      const reviewAt = nf.stepOrder.findIndex((id) => nf.steps[id]!.kind === "review");
      const index = op.position ?? (reviewAt === -1 ? nf.stepOrder.length : reviewAt);
      return [{ op: "addStep", index, step }];
    }
    case "updateStep": {
      const stepId = findStepId(nf, op.stepId);
      if (!stepId) return `Step "${op.stepId}" not found.`;
      const s = op.step ?? {};
      const changes: Record<string, unknown> = {};
      if (s.title?.trim()) changes.title = s.title.trim().slice(0, LIMITS.titleMax);
      if (s.description !== undefined) changes.description = s.description.trim() ? s.description.slice(0, LIMITS.helpMax) : undefined;
      if (s.showIf !== undefined) changes.visibleIf = buildCondition(s.showIf, refIndexFor(nf));
      return Object.keys(changes).length ? [{ op: "updateStep", stepId, changes }] : [];
    }
    case "removeStep": {
      const stepId = findStepId(nf, op.stepId);
      return stepId ? removeStepOps(nf, stepId) : `Step "${op.stepId}" not found.`;
    }
    case "moveStep": {
      const stepId = findStepId(nf, op.stepId);
      if (!stepId) return `Step "${op.stepId}" not found.`;
      return [{ op: "moveStep", stepId, toIndex: Math.max(0, op.position ?? nf.stepOrder.length - 1) }];
    }
    case "updateForm": {
      const f = op.form ?? {};
      const changes: Record<string, unknown> = {};
      if (f.title?.trim()) changes.title = f.title.trim().slice(0, LIMITS.titleMax);
      if (f.description !== undefined) changes.description = f.description.trim() ? f.description.slice(0, LIMITS.helpMax) : undefined;
      if (f.submitLabel?.trim()) changes.settings = { ...nf.meta.settings, submitLabel: f.submitLabel.trim().slice(0, 40) };
      return Object.keys(changes).length ? [{ op: "updateForm", changes }] : [];
    }
  }
}

export function applyAiEdit(nf: NormalizedForm, aiOps: readonly AiEditOp[]): AiEditOutcome {
  const alloc = new IdAllocator([...Object.keys(nf.fields), ...nf.stepOrder, ...Object.values(nf.fields).flatMap((f) => ("options" in f ? f.options.map((o) => o.id) : []))]);
  let form = nf;
  let baseline = errorKeys(form);
  const ops: PatchOp[] = [];
  const rejected: AiEditOutcome["rejected"] = [];

  aiOps.slice(0, 30).forEach((aiOp, index) => {
    const converted = convert(form, aiOp, alloc);
    if (typeof converted === "string") return rejected.push({ index, reason: converted });
    if (!converted.length) return;
    let next: NormalizedForm;
    try {
      next = applyOps(form, converted).form;
    } catch (e) {
      return rejected.push({ index, reason: e instanceof PatchError ? e.message : "Couldn't apply this change." });
    }
    const after = errorKeys(next);
    const introduced = [...after].find(([k]) => !baseline.has(k));
    if (introduced) return rejected.push({ index, reason: introduced[1] });
    form = next;
    baseline = after;
    ops.push(...converted);
  });

  const changedFieldIds = new Set<string>();
  const changedStepIds = new Set<string>();
  for (const op of ops) {
    if (op.op === "addField") changedFieldIds.add(op.field.id);
    else if (op.op === "updateField" || op.op === "moveField") changedFieldIds.add(op.fieldId);
    else if (op.op === "addStep") {
      changedStepIds.add(op.step.id);
      op.step.fields.forEach((f) => changedFieldIds.add(f.id));
    } else if (op.op === "updateStep" || op.op === "moveStep") changedStepIds.add(op.stepId);
  }
  // Removed things can't be highlighted.
  return {
    form,
    ops,
    rejected,
    changedFieldIds: [...changedFieldIds].filter((id) => form.fields[id]),
    changedStepIds: [...changedStepIds].filter((id) => form.steps[id]),
  };
}
