import type { AnswerValue, Answers, Clause, Condition, Field, FormDefinition } from "../schema/definition";
import { FIELD_TYPE_META, type AnswerKind } from "../schema/fieldTypes";

/**
 * Visibility engine.
 *
 * Conditions may only reference EARLIER fields (an earlier step, or earlier in the same
 * step). That lets us evaluate in a single pass in step/field order, and it makes
 * cycles impossible in any valid form. `analyzeRules` rejects forward references and
 * cycles when saving, so this pass never sees them in a published form. If it does
 * (e.g. a draft being edited), unknown or forward references just read as "empty".
 *
 * Hidden fields count as unanswered for everything after them. That's what makes hiding
 * cascade: if Q2 hides because of Q1, anything depending on Q2 hides too, even if Q2
 * still holds a stale answer from before Q1 changed.
 */

export type Visibility = {
  steps: ReadonlySet<string>;
  fields: ReadonlySet<string>;
  /** Visible step ids in order, the respondent's actual path through the form. */
  stepOrder: readonly string[];
};

export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "number") return Number.isNaN(v);
  return false;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

function compareOrdered(kind: AnswerKind, answer: AnswerValue, target: unknown): number | null {
  if (kind === "date") {
    if (typeof answer !== "string" || typeof target !== "string") return null;
    return answer < target ? -1 : answer > target ? 1 : 0; // ISO yyyy-mm-dd sorts lexicographically
  }
  const a = asNumber(answer);
  const b = asNumber(target);
  if (a === null || b === null) return null;
  return a - b;
}

/**
 * Comparisons against an unanswered field are false, including the negative ones.
 * "Show if role is not Intern" stays hidden until a role is picked. Use
 * isEmpty / isAnswered to branch on "not answered yet".
 */
export function evaluateClause(clause: Clause, answers: Answers, fieldsById: ReadonlyMap<string, Field>): boolean {
  const field = fieldsById.get(clause.fieldId);
  const answer = answers[clause.fieldId];
  const empty = isEmptyAnswer(answer);
  if (clause.op === "isEmpty") return empty;
  if (clause.op === "isAnswered") return !empty;
  if (!field || empty || answer === undefined || answer === null) return false;

  const kind = FIELD_TYPE_META[field.type].answerKind;
  const target = clause.value;
  const list = Array.isArray(target) ? target : target === undefined ? [] : [String(target)];

  switch (clause.op) {
    case "equals":
    case "notEquals": {
      let eq: boolean;
      if (kind === "boolean") eq = answer === (target === true || target === "true");
      else if (kind === "number") eq = compareOrdered(kind, answer, target) === 0;
      else if (kind === "text") eq = typeof answer === "string" && typeof target === "string" && norm(answer) === norm(target);
      else if (kind === "choices") eq = Array.isArray(answer) && answer.length === list.length && list.every((v) => answer.includes(v));
      else eq = answer === target;
      return clause.op === "equals" ? eq : !eq;
    }
    case "in":
    case "notIn": {
      const hit = Array.isArray(answer) ? answer.some((v) => list.includes(v)) : list.includes(String(answer));
      return clause.op === "in" ? hit : !hit;
    }
    case "contains":
    case "notContains": {
      let hit: boolean;
      if (Array.isArray(answer)) hit = list.some((v) => answer.includes(v));
      else hit = typeof target === "string" && typeof answer === "string" && norm(answer).includes(norm(target));
      return clause.op === "contains" ? hit : !hit;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const c = compareOrdered(kind, answer, target);
      if (c === null) return false;
      return clause.op === "gt" ? c > 0 : clause.op === "gte" ? c >= 0 : clause.op === "lt" ? c < 0 : c <= 0;
    }
  }
}

export function evaluateCondition(cond: Condition | undefined, answers: Answers, fieldsById: ReadonlyMap<string, Field>): boolean {
  if (!cond) return true;
  if ("all" in cond) return cond.all.every((c) => evaluateClause(c, answers, fieldsById));
  return cond.any.some((c) => evaluateClause(c, answers, fieldsById));
}

export function indexFields(form: FormDefinition): Map<string, Field> {
  const m = new Map<string, Field>();
  for (const s of form.steps) for (const f of s.fields) m.set(f.id, f);
  return m;
}

export function computeVisibility(form: FormDefinition, answers: Answers): Visibility {
  const fieldsById = indexFields(form);
  // Answers as later rules see them: only fields already found visible.
  const effective: Answers = {};
  const steps = new Set<string>();
  const fields = new Set<string>();
  const stepOrder: string[] = [];

  for (const step of form.steps) {
    const stepVisible = evaluateCondition(step.visibleIf, effective, fieldsById);
    if (stepVisible) {
      steps.add(step.id);
      stepOrder.push(step.id);
    }
    for (const field of step.fields) {
      if (stepVisible && evaluateCondition(field.visibleIf, effective, fieldsById)) {
        fields.add(field.id);
        effective[field.id] = answers[field.id];
      }
    }
  }
  return { steps, fields, stepOrder };
}

/** Drop answers to hidden or unknown fields. Run before review, validation and submit. */
export function pruneHiddenAnswers(form: FormDefinition, answers: Answers, visibility = computeVisibility(form, answers)): Answers {
  const out: Answers = {};
  for (const id of visibility.fields) {
    const v = answers[id];
    if (v !== undefined) out[id] = v;
  }
  return out;
}
