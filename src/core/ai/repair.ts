import {
  FIELD_TYPES,
  FieldSchema,
  LIMITS,
  OPERATORS,
  SCHEMA_VERSION,
  type ChoiceOption,
  type Clause,
  type Condition,
  type Field,
  type FieldType,
  type FormDefinition,
  type Operator,
  type Step,
} from "../schema/definition";
import { FIELD_TYPE_META, isChoiceField, normaliseFieldShape } from "../schema/fieldTypes";
import { toIdLike } from "../schema/ids";
import { analyzeRules } from "../rules/analyze";
import { validateForm } from "../schema/validateForm";

/**
 * Turn model output (possibly partial, possibly wrong) into a valid FormDefinition.
 *
 * Deterministic: missing ids are derived from labels/positions, never random, so a form
 * streamed in pieces keeps stable ids (and stable React keys) between updates.
 * Policy: fix what has an obvious fix (aliases, ids, option labels -> ids), drop what
 * doesn't (unknown rule targets, forward refs), and report each fix in `notes`.
 */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const lc = (s: string) => s.trim().toLowerCase();

const TYPE_ALIASES: Record<string, FieldType> = {
  text: "shortText",
  short_text: "shortText",
  shorttext: "shortText",
  string: "shortText",
  name: "shortText",
  textarea: "longText",
  long_text: "longText",
  longtext: "longText",
  paragraph: "longText",
  essay: "longText",
  mail: "email",
  "e-mail": "email",
  tel: "phone",
  telephone: "phone",
  mobile: "phone",
  integer: "number",
  numeric: "number",
  int: "number",
  decimal: "number",
  radio: "singleChoice",
  single_choice: "singleChoice",
  singlechoice: "singleChoice",
  choice: "singleChoice",
  checkbox: "multipleChoice",
  checkboxes: "multipleChoice",
  multiple_choice: "multipleChoice",
  multiplechoice: "multipleChoice",
  multiselect: "multipleChoice",
  select: "dropdown",
  dropdown: "dropdown",
  link: "url",
  website: "url",
  uri: "url",
  scale: "rating",
  stars: "rating",
  star: "rating",
  boolean: "yesNo",
  yes_no: "yesNo",
  yesno: "yesNo",
  bool: "yesNo",
  confirm: "yesNo",
  datetime: "date",
  calendar: "date",
};

export function resolveFieldType(raw: unknown): FieldType | null {
  if (typeof raw !== "string") return null;
  if ((FIELD_TYPES as readonly string[]).includes(raw)) return raw as FieldType;
  return TYPE_ALIASES[lc(raw)] ?? TYPE_ALIASES[lc(raw).replace(/[\s-]/g, "_")] ?? null;
}

/** Allocates unique ids within one form, deterministically. */
export class IdAllocator {
  private used = new Set<string>();
  constructor(existing: Iterable<string> = []) {
    for (const id of existing) this.used.add(id);
  }
  take(preferred: string | undefined, fallbackSeed: string, prefix: "f" | "s" | "o"): string {
    const base =
      (preferred && toIdLike(preferred, prefix)) ||
      toIdLike(fallbackSeed, prefix) ||
      `${prefix}_item`;
    let id = base.slice(0, 60);
    for (let n = 2; this.used.has(id); n++) id = `${base.slice(0, 56)}_${n}`;
    this.used.add(id);
    return id;
  }
  has(id: string) {
    return this.used.has(id);
  }
}

/** Lookup tables for resolving rule references the model wrote by id or by label. */
export type RefIndex = {
  /** raw id / new id / lowercase label -> field id */
  fieldByRef: Map<string, string>;
  fields: Map<string, Field>;
};

export function emptyRefIndex(): RefIndex {
  return { fieldByRef: new Map(), fields: new Map() };
}

export function registerField(idx: RefIndex, field: Field, rawId?: string) {
  idx.fields.set(field.id, field);
  idx.fieldByRef.set(field.id, field.id);
  idx.fieldByRef.set(lc(field.id), field.id);
  if (rawId) {
    idx.fieldByRef.set(rawId, field.id);
    idx.fieldByRef.set(lc(rawId), field.id);
  }
  if (!idx.fieldByRef.has(lc(field.label))) idx.fieldByRef.set(lc(field.label), field.id);
}

export function buildOptions(
  raw: unknown,
  alloc: IdAllocator,
  existing: readonly ChoiceOption[] = [],
): ChoiceOption[] {
  if (!Array.isArray(raw)) return [];
  const byLabel = new Map(existing.map((o) => [lc(o.label), o]));
  const seen = new Set<string>();
  const out: ChoiceOption[] = [];
  for (const item of raw.slice(0, LIMITS.optionsMax)) {
    const label = str(
      isRec(item) ? (item.label ?? item.value ?? item.text) : item,
      LIMITS.optionLabelMax,
    );
    if (!label || seen.has(lc(label))) continue;
    seen.add(lc(label));
    const keep = byLabel.get(lc(label));
    out.push(
      keep
        ? { id: keep.id, label }
        : { id: alloc.take(isRec(item) ? str(item.id, 60) : undefined, label, "o"), label },
    );
  }
  return out;
}

/** Map a clause value written as a label (or id) to option ids for choice fields; coerce others. */
function resolveClauseValue(
  field: Field,
  op: Operator,
  rawValue: unknown,
  rawValues: unknown,
): Clause["value"] | null {
  if (op === "isAnswered" || op === "isEmpty") return undefined;
  const kind = FIELD_TYPE_META[field.type].answerKind;
  const list =
    Array.isArray(rawValues) && rawValues.length
      ? rawValues
      : Array.isArray(rawValue)
        ? rawValue
        : rawValue === undefined
          ? []
          : [rawValue];
  if (isChoiceField(field)) {
    const ids = list
      .map((v) => {
        const s = String(v);
        return field.options.find((o) => o.id === s || lc(o.label) === lc(s))?.id;
      })
      .filter((v): v is string => !!v);
    if (!ids.length) return null;
    if (op === "in" || op === "notIn") return ids;
    if (kind === "choices" && (op === "equals" || op === "notEquals")) return ids;
    return ids[0]!;
  }
  const first = list[0];
  if (first === undefined) return null;
  if (kind === "boolean") {
    if (first === true || first === false) return first;
    const s = lc(String(first));
    return s === "true" || s === "yes" ? true : s === "false" || s === "no" ? false : null;
  }
  if (kind === "number") return num(first) ?? null;
  return String(first);
}

/** Convert a model-written condition ({match, rules} or {all}/{any}) into a Condition, dropping unresolvable clauses. */
export function buildCondition(raw: unknown, idx: RefIndex): Condition | undefined {
  if (!isRec(raw)) return undefined;
  let match: "all" | "any" = raw.match === "any" ? "any" : "all";
  let rules: unknown = raw.rules;
  if (Array.isArray(raw.all)) rules = raw.all;
  else if (Array.isArray(raw.any)) {
    rules = raw.any;
    match = "any";
  }
  if (!Array.isArray(rules)) return undefined;
  const clauses: Clause[] = [];
  for (const r of rules.slice(0, LIMITS.clausesMax)) {
    if (!isRec(r)) continue;
    const ref = str(r.questionId ?? r.fieldId, 120);
    const fieldId = ref ? (idx.fieldByRef.get(ref) ?? idx.fieldByRef.get(lc(ref))) : undefined;
    const field = fieldId ? idx.fields.get(fieldId) : undefined;
    const op = (OPERATORS as readonly string[]).includes(String(r.operator ?? r.op))
      ? (String(r.operator ?? r.op) as Operator)
      : null;
    if (!field || !op || !FIELD_TYPE_META[field.type].operators.includes(op)) continue;
    const value = resolveClauseValue(field, op, r.value, r.values);
    if (value === null) continue;
    clauses.push(
      value === undefined ? { fieldId: field.id, op } : { fieldId: field.id, op, value },
    );
  }
  if (!clauses.length) return undefined;
  return match === "any" ? { any: clauses } : { all: clauses };
}

/**
 * Build a strict Field from a model-written one. Conditions are NOT resolved here
 * (they need every earlier field registered first); the raw condition is returned.
 */
export function buildField(
  raw: unknown,
  alloc: IdAllocator,
  notes: string[],
  existing?: Field,
): { field: Field; rawId?: string; rawCondition?: unknown } | null {
  if (!isRec(raw)) return null;
  const label = str(raw.label ?? raw.question ?? raw.title, LIMITS.labelMax) ?? existing?.label;
  if (!label) return null;
  let type = resolveFieldType(raw.type) ?? existing?.type ?? null;
  if (!type) {
    notes.push(`"${label}": unknown type "${String(raw.type)}", used short text.`);
    type = "shortText";
  }
  const rawId = str(raw.id, 80);
  const id = existing?.id ?? alloc.take(rawId, label, "f");

  const draft: Rec = {
    id,
    type,
    label,
    required: typeof raw.required === "boolean" ? raw.required : raw.required === "true",
  };
  const helpText = str(raw.helpText ?? raw.description, LIMITS.helpMax);
  if (helpText) draft.helpText = helpText;
  const placeholder = str(raw.placeholder, LIMITS.placeholderMax);
  if (placeholder) draft.placeholder = placeholder;
  for (const k of ["min", "max", "minLength", "maxLength", "minSelected", "maxSelected"] as const) {
    const n = num(raw[k]);
    if (n !== undefined) draft[k] = k === "min" || k === "max" ? n : Math.max(0, Math.round(n));
  }
  if (typeof raw.integer === "boolean") draft.integer = raw.integer;

  if (type === "singleChoice" || type === "multipleChoice" || type === "dropdown") {
    const opts = buildOptions(
      raw.options,
      alloc,
      existing && isChoiceField(existing) ? existing.options : [],
    );
    if (opts.length === 0) {
      notes.push(`"${label}": choice question had no options, changed to short text.`);
      type = "shortText";
      draft.type = type;
    } else draft.options = opts;
  }
  if (type === "rating") {
    draft.max = 5;
    delete draft.min;
  }

  // Keep only keys valid for the type, then drop any individual key that fails validation.
  let shaped = normaliseFieldShape(draft, type);
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = FieldSchema.safeParse(shaped);
    if (r.success) return { field: r.data, rawId, rawCondition: raw.showIf ?? raw.visibleIf };
    const bad = r.error.issues[0]?.path[0];
    if (typeof bad !== "string" || ["id", "type", "label", "required", "options"].includes(bad))
      break;
    const { [bad]: _dropped, ...rest } = shaped;
    shaped = rest;
    notes.push(`"${label}": removed invalid "${bad}" setting.`);
  }
  return null;
}

export type RepairResult =
  | { ok: true; form: FormDefinition; notes: string[] }
  | { ok: false; reason: string; notes: string[] };

/**
 * Repair a whole model-written form. `partial: true` is for streaming previews: it keeps
 * whatever is usable so far and never fails for being incomplete.
 */
export function repairForm(raw: unknown, opts: { partial?: boolean } = {}): RepairResult {
  const notes: string[] = [];
  if (!isRec(raw)) return { ok: false, reason: "The AI didn't return a form.", notes };

  const alloc = new IdAllocator();
  const idx = emptyRefIndex();
  const rawSteps: unknown[] = Array.isArray(raw.steps)
    ? raw.steps
    : Array.isArray(raw.questions ?? raw.fields)
      ? [{ title: "Questions", questions: raw.questions ?? raw.fields }]
      : [];

  const steps: Step[] = [];
  const pending: {
    owner: { kind: "step"; step: Step } | { kind: "field"; step: Step; fieldIndex: number };
    raw: unknown;
  }[] = [];

  rawSteps.slice(0, LIMITS.stepsMax).forEach((rs, si) => {
    if (!isRec(rs)) return;
    const title = str(rs.title, LIMITS.titleMax) ?? `Step ${si + 1}`;
    const rawFields = Array.isArray(rs.questions)
      ? rs.questions
      : Array.isArray(rs.fields)
        ? rs.fields
        : [];
    const wantsReview =
      rs.kind === "review" ||
      (rawFields.length === 0 && /\breview\b|\bsummary\b|\bconfirm/i.test(title));
    const step: Step = {
      id: alloc.take(str(rs.id, 80), title, "s"),
      title,
      kind: wantsReview && rawFields.length === 0 ? "review" : "questions",
      fields: [],
    };
    if (wantsReview && rawFields.length > 0)
      notes.push(`"${title}" was a review step with questions; kept it as a question step.`);
    const desc = str(rs.description, LIMITS.helpMax);
    if (desc) step.description = desc;

    // Step conditions may only use earlier steps' fields, which are already registered.
    if (rs.showIf ?? rs.visibleIf)
      pending.push({ owner: { kind: "step", step }, raw: rs.showIf ?? rs.visibleIf });

    rawFields.slice(0, LIMITS.fieldsPerStepMax).forEach((rf) => {
      const built = buildField(rf, alloc, notes);
      if (!built) {
        if (!opts.partial) notes.push(`Skipped an incomplete question in "${title}".`);
        return;
      }
      step.fields.push(built.field);
      if (built.rawCondition)
        pending.push({
          owner: { kind: "field", step, fieldIndex: step.fields.length - 1 },
          raw: built.rawCondition,
        });
      registerField(idx, built.field, built.rawId);
    });
    steps.push(step);
  });

  // Resolve conditions now that every field is known.
  for (const p of pending) {
    const cond = buildCondition(p.raw, idx);
    if (!cond) continue;
    if (p.owner.kind === "step") p.owner.step.visibleIf = cond;
    else
      p.owner.step.fields[p.owner.fieldIndex] = {
        ...p.owner.step.fields[p.owner.fieldIndex]!,
        visibleIf: cond,
      };
  }

  // Review step: at most one, always last.
  const reviews = steps.filter((s) => s.kind === "review");
  let ordered = steps.filter((s) => s.kind !== "review" && (s.fields.length > 0 || opts.partial));
  if (reviews.length) ordered = [...ordered, reviews[0]!];
  if (reviews.length > 1) notes.push("Kept only one review step.");

  const form: FormDefinition = {
    schemaVersion: SCHEMA_VERSION,
    title: str(raw.title, LIMITS.titleMax) ?? "Untitled form",
    steps: ordered,
    settings: {
      submitLabel: str(raw.submitLabel, 40) ?? "Submit",
      confirmation: {
        title: "Thanks!",
        message: str(raw.confirmationMessage, LIMITS.helpMax) ?? "Your response has been recorded.",
      },
    },
  };
  const desc = str(raw.description, LIMITS.helpMax);
  if (desc) form.description = desc;

  dropBrokenRules(form, notes);

  if (opts.partial) return { ok: true, form, notes };
  if (!form.steps.some((s) => s.fields.length > 0))
    return { ok: false, reason: "The AI didn't produce any usable questions.", notes };
  const v = validateForm(form);
  if (!v.ok)
    return {
      ok: false,
      reason: v.issues.find((i) => i.severity === "error")?.message ?? "Invalid form",
      notes,
    };
  return { ok: true, form: v.form, notes };
}

/** Remove conditions that reference later/unknown fields or form cycles. Mutates `form`. */
export function dropBrokenRules(form: FormDefinition, notes: string[]) {
  for (let pass = 0; pass < 3; pass++) {
    const issues = analyzeRules(form).filter((i) => i.severity === "error" && i.targetId);
    if (!issues.length) return;
    const targets = new Set(issues.map((i) => i.targetId!));
    for (const step of form.steps) {
      if (targets.has(step.id) && step.visibleIf) {
        delete step.visibleIf;
        notes.push(`Removed an invalid rule from step "${step.title}".`);
      }
      step.fields = step.fields.map((f) => {
        if (!targets.has(f.id) || !f.visibleIf) return f;
        notes.push(`Removed an invalid rule from "${f.label}".`);
        const { visibleIf: _v, ...rest } = f;
        return rest as Field;
      });
    }
  }
}
