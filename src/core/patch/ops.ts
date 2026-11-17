import { z } from "zod";
import {
  FieldSchema,
  FieldType,
  FormSettings,
  Id,
  StepSchema,
  type Field,
  type FormDefinition,
  type Step,
} from "../schema/definition";
import { normaliseFieldShape } from "../schema/fieldTypes";
import { locateField, type NormalizedForm, type StepNode } from "./normalized";

/**
 * Domain-level patch operations, keyed by stable ids.
 *
 * Why not RFC 6902 JSON Patch? Index paths like /steps/2/fields/4 break as soon as
 * anything is reordered, they're hard for an LLM to get right, and they can't be
 * validated per op. Id-keyed domain ops are small, readable, validated one by one,
 * and inverted at apply time, so the same format serves as the undo log.
 */

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ValueOfUnion<T, K extends PropertyKey> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;
/** Any subset of any field type's keys. `undefined` (or `null` from JSON) removes the key. */
export type FieldChanges = { [K in Exclude<KeysOfUnion<Field>, "id">]?: ValueOfUnion<Field, K> | undefined };
export type StepChanges = Partial<Pick<Step, "title" | "description" | "kind" | "visibleIf">>;
export type FormChanges = Partial<Pick<FormDefinition, "title" | "description" | "settings">>;

export type PatchOp =
  | { op: "addStep"; index: number; step: Step }
  | { op: "updateStep"; stepId: string; changes: StepChanges }
  | { op: "removeStep"; stepId: string }
  | { op: "moveStep"; stepId: string; toIndex: number }
  | { op: "addField"; stepId: string; index: number; field: Field }
  | { op: "updateField"; fieldId: string; changes: FieldChanges }
  | { op: "removeField"; fieldId: string }
  | { op: "moveField"; fieldId: string; toStepId: string; toIndex: number }
  | { op: "updateForm"; changes: FormChanges };

const index = z.int().min(0).max(1000);
const nullable = <T extends z.ZodType>(s: T) => s.nullable().optional();

/** Runtime schema for ops arriving from outside (the AI, storage). `changes` are checked again after applying. */
export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addStep"), index, step: StepSchema }),
  z.object({
    op: z.literal("updateStep"),
    stepId: Id,
    changes: z
      .object({ title: z.string().optional(), description: nullable(z.string()), kind: StepSchema.shape.kind.optional(), visibleIf: nullable(StepSchema.shape.visibleIf.unwrap()) })
      .strict(),
  }),
  z.object({ op: z.literal("removeStep"), stepId: Id }),
  z.object({ op: z.literal("moveStep"), stepId: Id, toIndex: index }),
  z.object({ op: z.literal("addField"), stepId: Id, index, field: FieldSchema }),
  z.object({
    op: z.literal("updateField"),
    fieldId: Id,
    changes: z.record(z.string(), z.unknown()).refine((c) => !("id" in c), "A field's id can't be changed").refine((c) => !("type" in c) || FieldType.safeParse(c.type).success, "Unknown field type"),
  }),
  z.object({ op: z.literal("removeField"), fieldId: Id }),
  z.object({ op: z.literal("moveField"), fieldId: Id, toStepId: Id, toIndex: index }),
  z.object({
    op: z.literal("updateForm"),
    changes: z.object({ title: z.string().optional(), description: nullable(z.string()), settings: FormSettings.optional() }).strict(),
  }),
]);

export class PatchError extends Error {
  constructor(
    message: string,
    readonly op: PatchOp,
  ) {
    super(message);
    this.name = "PatchError";
  }
}

const clamp = (i: number, max: number) => Math.max(0, Math.min(Math.trunc(i), max));

function insertAt<T>(arr: readonly T[], i: number, item: T): T[] {
  const out = arr.slice();
  out.splice(clamp(i, arr.length), 0, item);
  return out;
}
function removeAt<T>(arr: readonly T[], i: number): T[] {
  const out = arr.slice();
  out.splice(i, 1);
  return out;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Merge `changes` into `obj`; undefined/null removes the key. */
function merge<T extends object>(obj: T, changes: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

/** Changes that turn `after` back into `before`, over the union of their keys. */
function diffInverse(before: Record<string, unknown>, after: Record<string, unknown>, skip: ReadonlySet<string>): Record<string, unknown> {
  const inverse: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.has(k)) continue;
    if (!same(before[k], after[k])) inverse[k] = before[k]; // undefined -> "remove key"
  }
  return inverse;
}

const NO_KEYS = new Set<string>();
const STEP_SKIP = new Set(["id", "fieldIds"]);
const FIELD_SKIP = new Set(["id"]);

export type ApplyResult = { form: NormalizedForm; inverse: PatchOp[] };

/** Apply one op. Pure: never mutates `nf`. Throws PatchError if the target doesn't exist or ids collide. */
export function applyOp(nf: NormalizedForm, op: PatchOp): ApplyResult {
  switch (op.op) {
    case "addStep": {
      if (nf.steps[op.step.id]) throw new PatchError(`Step "${op.step.id}" already exists`, op);
      const fields = { ...nf.fields };
      for (const f of op.step.fields) {
        if (fields[f.id]) throw new PatchError(`Question "${f.id}" already exists`, op);
        fields[f.id] = f;
      }
      const { fields: stepFields, ...rest } = op.step;
      const node: StepNode = { ...rest, fieldIds: stepFields.map((f) => f.id) };
      return {
        form: { ...nf, stepOrder: insertAt(nf.stepOrder, op.index, op.step.id), steps: { ...nf.steps, [op.step.id]: node }, fields },
        inverse: [{ op: "removeStep", stepId: op.step.id }],
      };
    }
    case "removeStep": {
      const node = nf.steps[op.stepId];
      if (!node) throw new PatchError(`Step "${op.stepId}" not found`, op);
      const at = nf.stepOrder.indexOf(op.stepId);
      const { fieldIds, ...rest } = node;
      const step: Step = { ...rest, fields: fieldIds.map((id) => nf.fields[id]!) };
      const steps = { ...nf.steps };
      delete steps[op.stepId];
      const fields = { ...nf.fields };
      for (const id of fieldIds) delete fields[id];
      return { form: { ...nf, stepOrder: removeAt(nf.stepOrder, at), steps, fields }, inverse: [{ op: "addStep", index: at, step }] };
    }
    case "updateStep": {
      const node = nf.steps[op.stepId];
      if (!node) throw new PatchError(`Step "${op.stepId}" not found`, op);
      const next = merge(node, op.changes);
      const inverse = diffInverse(node as unknown as Record<string, unknown>, next, STEP_SKIP);
      return {
        form: { ...nf, steps: { ...nf.steps, [op.stepId]: next as unknown as StepNode } },
        inverse: [{ op: "updateStep", stepId: op.stepId, changes: inverse as StepChanges }],
      };
    }
    case "moveStep": {
      const from = nf.stepOrder.indexOf(op.stepId);
      if (from === -1) throw new PatchError(`Step "${op.stepId}" not found`, op);
      const without = removeAt(nf.stepOrder, from);
      const to = clamp(op.toIndex, without.length);
      return { form: { ...nf, stepOrder: insertAt(without, to, op.stepId) }, inverse: [{ op: "moveStep", stepId: op.stepId, toIndex: from }] };
    }
    case "addField": {
      const node = nf.steps[op.stepId];
      if (!node) throw new PatchError(`Step "${op.stepId}" not found`, op);
      if (nf.fields[op.field.id]) throw new PatchError(`Question "${op.field.id}" already exists`, op);
      return {
        form: {
          ...nf,
          steps: { ...nf.steps, [op.stepId]: { ...node, fieldIds: insertAt(node.fieldIds, op.index, op.field.id) } },
          fields: { ...nf.fields, [op.field.id]: op.field },
        },
        inverse: [{ op: "removeField", fieldId: op.field.id }],
      };
    }
    case "removeField": {
      const loc = locateField(nf, op.fieldId);
      const field = nf.fields[op.fieldId];
      if (!loc || !field) throw new PatchError(`Question "${op.fieldId}" not found`, op);
      const node = nf.steps[loc.stepId]!;
      const fields = { ...nf.fields };
      delete fields[op.fieldId];
      return {
        form: { ...nf, steps: { ...nf.steps, [loc.stepId]: { ...node, fieldIds: removeAt(node.fieldIds, loc.index) } }, fields },
        inverse: [{ op: "addField", stepId: loc.stepId, index: loc.index, field }],
      };
    }
    case "updateField": {
      const field = nf.fields[op.fieldId];
      if (!field) throw new PatchError(`Question "${op.fieldId}" not found`, op);
      if ("id" in op.changes) throw new PatchError("A question's id can't be changed", op);
      let next = merge(field, op.changes as Record<string, unknown>);
      // A type change reshapes the field: drop keys the new type doesn't allow, add required ones.
      if (next.type !== field.type) next = normaliseFieldShape(next, next.type as Field["type"]);
      const inverse = diffInverse(field as unknown as Record<string, unknown>, next, FIELD_SKIP);
      return {
        form: { ...nf, fields: { ...nf.fields, [op.fieldId]: next as unknown as Field } },
        inverse: [{ op: "updateField", fieldId: op.fieldId, changes: inverse as FieldChanges }],
      };
    }
    case "moveField": {
      const loc = locateField(nf, op.fieldId);
      if (!loc) throw new PatchError(`Question "${op.fieldId}" not found`, op);
      const target = nf.steps[op.toStepId];
      if (!target) throw new PatchError(`Step "${op.toStepId}" not found`, op);
      const source = nf.steps[loc.stepId]!;
      const steps = { ...nf.steps };
      if (loc.stepId === op.toStepId) {
        const without = removeAt(source.fieldIds, loc.index);
        steps[loc.stepId] = { ...source, fieldIds: insertAt(without, op.toIndex, op.fieldId) };
      } else {
        steps[loc.stepId] = { ...source, fieldIds: removeAt(source.fieldIds, loc.index) };
        steps[op.toStepId] = { ...target, fieldIds: insertAt(target.fieldIds, op.toIndex, op.fieldId) };
      }
      return { form: { ...nf, steps }, inverse: [{ op: "moveField", fieldId: op.fieldId, toStepId: loc.stepId, toIndex: loc.index }] };
    }
    case "updateForm": {
      const next = merge(nf.meta, op.changes);
      const inverse = diffInverse(nf.meta as unknown as Record<string, unknown>, next, NO_KEYS);
      return { form: { ...nf, meta: next as unknown as NormalizedForm["meta"] }, inverse: [{ op: "updateForm", changes: inverse as FormChanges }] };
    }
  }
}

/**
 * Apply ops in order, atomically: if any op throws, nothing is applied.
 * The inverse is in undo order (last op's inverse first).
 */
export function applyOps(nf: NormalizedForm, ops: readonly PatchOp[]): ApplyResult {
  let form = nf;
  const inverses: PatchOp[][] = [];
  for (const op of ops) {
    const r = applyOp(form, op);
    form = r.form;
    inverses.push(r.inverse);
  }
  return { form, inverse: inverses.reverse().flat() };
}
