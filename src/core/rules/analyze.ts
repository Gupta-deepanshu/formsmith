import type { Clause, Condition, Field, FormDefinition } from "../schema/definition";
import { FIELD_TYPE_META, isChoiceField } from "../schema/fieldTypes";
import type { FormIssue } from "../schema/issues";

/**
 * Save-time rule checks. Produces issues the editor shows inline; errors block publish.
 *
 * Two layers:
 *  1. Ordering: a condition may only reference fields that come BEFORE its owner
 *     (earlier step, or earlier in the same step for field rules). A valid form
 *     can't have a cycle under this rule.
 *  2. Cycle detection (DFS over the dependency graph) still runs, so that when a
 *     reorder creates a loop the message names the loop ("A -> B -> A") instead of
 *     just "forward reference".
 */

type Owner = { kind: "step" | "field"; id: string; label: string; path: (string | number)[] };

function clausesOf(cond: Condition | undefined): Clause[] {
  if (!cond) return [];
  return "all" in cond ? cond.all : cond.any;
}

function checkClause(clause: Clause, field: Field | undefined, owner: Owner, path: (string | number)[], issues: FormIssue[]) {
  const push = (code: FormIssue["code"], message: string) =>
    issues.push({ severity: "error", code, message, targetId: owner.id, path });

  if (!field) return push("rule.unknownField", `"${owner.label}" has a rule that refers to a question that no longer exists.`);
  const meta = FIELD_TYPE_META[field.type];
  if (!meta.operators.includes(clause.op)) {
    return push("rule.badOperator", `"${owner.label}": "${clause.op}" can't be used with ${meta.label.toLowerCase()} questions.`);
  }
  if (clause.op === "isAnswered" || clause.op === "isEmpty") return;
  const v = clause.value;
  if (v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)) {
    return push("rule.missingValue", `"${owner.label}": the rule on "${field.label}" needs a value.`);
  }
  if (isChoiceField(field)) {
    const ids = new Set(field.options.map((o) => o.id));
    const values = Array.isArray(v) ? v : [String(v)];
    if (values.some((x) => !ids.has(x))) {
      push("rule.unknownOption", `"${owner.label}": the rule on "${field.label}" uses an option that no longer exists.`);
    }
  }
  if ((meta.answerKind === "number") && (Array.isArray(v) || typeof v === "boolean" || !Number.isFinite(Number(v)))) {
    push("rule.badValue", `"${owner.label}": the rule on "${field.label}" needs a number.`);
  }
}

export function analyzeRules(form: FormDefinition): FormIssue[] {
  const issues: FormIssue[] = [];
  const fieldsById = new Map<string, Field>();
  /** Position of every field in reading order. */
  const position = new Map<string, { stepIndex: number; fieldIndex: number }>();
  form.steps.forEach((s, si) =>
    s.fields.forEach((f, fi) => {
      fieldsById.set(f.id, f);
      position.set(f.id, { stepIndex: si, fieldIndex: fi });
    }),
  );

  const deps = new Map<string, string[]>(); // owner id -> referenced field ids
  const labels = new Map<string, string>();

  form.steps.forEach((step, si) => {
    labels.set(step.id, step.title);
    const stepOwner: Owner = { kind: "step", id: step.id, label: step.title, path: ["steps", si] };
    const stepRefs = clausesOf(step.visibleIf);
    deps.set(step.id, stepRefs.map((c) => c.fieldId));
    stepRefs.forEach((c, ci) => {
      const path = ["steps", si, "visibleIf", ci];
      checkClause(c, fieldsById.get(c.fieldId), stepOwner, path, issues);
      const pos = position.get(c.fieldId);
      if (pos && pos.stepIndex >= si) {
        issues.push({ severity: "error", code: "rule.forwardRef", targetId: step.id, path, message: `Step "${step.title}" can only depend on questions in earlier steps.` });
      }
    });

    step.fields.forEach((field, fi) => {
      labels.set(field.id, field.label);
      const owner: Owner = { kind: "field", id: field.id, label: field.label, path: ["steps", si, "fields", fi] };
      const refs = clausesOf(field.visibleIf);
      // A field also depends on its step's condition, so step rules join the graph too.
      deps.set(field.id, [...refs.map((c) => c.fieldId), step.id]);
      refs.forEach((c, ci) => {
        const path = ["steps", si, "fields", fi, "visibleIf", ci];
        if (c.fieldId === field.id) {
          issues.push({ severity: "error", code: "rule.selfRef", targetId: field.id, path, message: `"${field.label}" can't depend on itself.` });
          return;
        }
        checkClause(c, fieldsById.get(c.fieldId), owner, path, issues);
        const pos = position.get(c.fieldId);
        if (pos && (pos.stepIndex > si || (pos.stepIndex === si && pos.fieldIndex > fi))) {
          issues.push({ severity: "error", code: "rule.forwardRef", targetId: field.id, path, message: `"${field.label}" depends on "${fieldsById.get(c.fieldId)?.label}", which comes after it. Move it earlier or change the rule.` });
        }
      });
    });
  });

  for (const cycle of findCycles(deps)) {
    const names = cycle.map((id) => `"${labels.get(id) ?? id}"`).join(" → ");
    issues.push({ severity: "error", code: "rule.cycle", targetId: cycle[0]!, path: [], message: `Circular rule: ${names}.` });
  }
  return issues;
}

/** DFS with white/grey/black colouring (depth is bounded by form size limits). Returns each distinct cycle once, as a closed path. */
export function findCycles(graph: ReadonlyMap<string, readonly string[]>): string[][] {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (node: string) => {
    colour.set(node, GREY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      const c = colour.get(next) ?? WHITE;
      if (c === GREY) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join("|");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push([...cycle, next]);
        }
      } else if (c === WHITE) visit(next);
    }
    stack.pop();
    colour.set(node, BLACK);
  };
  for (const node of graph.keys()) if ((colour.get(node) ?? WHITE) === WHITE) visit(node);
  return cycles;
}
