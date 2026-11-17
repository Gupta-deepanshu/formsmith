import { analyzeRules } from "../rules/analyze";
import { FormDefinitionSchema, type FormDefinition } from "./definition";
import type { FormIssue } from "./issues";

/**
 * Full check of a form definition: structure (Zod), cross references (unique ids,
 * review step placement) and rules (references, ordering, cycles).
 *
 * Returns issues instead of throwing so the editor can show them inline while the
 * owner keeps editing. Only errors block publish.
 */
export function validateForm(
  input: unknown,
): { ok: true; form: FormDefinition; issues: FormIssue[] } | { ok: false; issues: FormIssue[] } {
  const parsed = FormDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        severity: "error",
        code: "schema",
        message: i.message,
        path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
        targetId: targetIdForPath(input, i.path),
      })),
    };
  }
  const form = parsed.data;
  const issues: FormIssue[] = [...structuralIssues(form), ...analyzeRules(form)];
  return issues.some((i) => i.severity === "error")
    ? { ok: false, issues }
    : { ok: true, form, issues };
}

function structuralIssues(form: FormDefinition): FormIssue[] {
  const issues: FormIssue[] = [];
  const seen = new Map<string, string>();
  const claim = (id: string, what: string, path: (string | number)[]) => {
    if (seen.has(id)) {
      issues.push({
        severity: "error",
        code: "duplicateId",
        message: `Duplicate id "${id}" (${what}).`,
        targetId: id,
        path,
      });
    } else seen.set(id, what);
  };

  let reviewCount = 0;
  let questionCount = 0;
  form.steps.forEach((step, si) => {
    claim(step.id, "step", ["steps", si]);
    if (step.kind === "review") {
      reviewCount++;
      if (si !== form.steps.length - 1) {
        issues.push({
          severity: "error",
          code: "review.notLast",
          message: "The review step must be the last step.",
          targetId: step.id,
          path: ["steps", si],
        });
      }
      if (step.fields.length > 0) {
        issues.push({
          severity: "error",
          code: "review.hasFields",
          message: "A review step can't contain questions.",
          targetId: step.id,
          path: ["steps", si],
        });
      }
    } else if (step.fields.length === 0) {
      issues.push({
        severity: "warning",
        code: "emptyStep",
        message: `Step "${step.title}" has no questions.`,
        targetId: step.id,
        path: ["steps", si],
      });
    }
    step.fields.forEach((f, fi) => {
      questionCount++;
      claim(f.id, "question", ["steps", si, "fields", fi]);
    });
  });
  if (reviewCount > 1) {
    issues.push({
      severity: "error",
      code: "review.multiple",
      message: "Only one review step is allowed.",
      path: ["steps"],
    });
  }
  if (questionCount === 0) {
    issues.push({
      severity: "error",
      code: "noQuestions",
      message: "Add at least one question.",
      path: ["steps"],
    });
  }
  return issues;
}

/** Best effort: find the id of the deepest step/field on a Zod issue path. */
function targetIdForPath(input: unknown, path: readonly PropertyKey[]): string | undefined {
  let node: unknown = input;
  let id: string | undefined;
  for (const key of path) {
    if (node === null || typeof node !== "object") break;
    node = (node as Record<PropertyKey, unknown>)[key];
    if (
      node &&
      typeof node === "object" &&
      "id" in node &&
      typeof (node as { id: unknown }).id === "string"
    ) {
      const candidate = (node as { id: string }).id;
      // Option ids aren't editor targets; stop at fields.
      if (!("label" in node) || "type" in node || "kind" in node) id = candidate;
    }
  }
  return id;
}
