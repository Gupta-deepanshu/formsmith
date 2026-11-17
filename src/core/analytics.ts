import { formatAnswer } from "./answers";
import { computeVisibility, isEmptyAnswer } from "./rules/engine";
import type { Answers, Field, FormDefinition } from "./schema/definition";

/** Response analytics and CSV export: pure functions over loaded rows (also used by the public demo stats). */

export type ResponseRecord = {
  id: string;
  versionId: string;
  status: "draft" | "submitted";
  answers: Answers;
  furthestStepIndex: number;
  startedAt: string;
  submittedAt: string | null;
};

/**
 * Columns across versions: fields of the newest version first (in its order), then
 * fields that only exist in older versions. Same id = same question.
 */
export function mergedFields(versionsNewestFirst: FormDefinition[]): Field[] {
  const seen = new Set<string>();
  const out: Field[] = [];
  for (const form of versionsNewestFirst) {
    for (const f of form.steps.flatMap((s) => s.fields)) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        out.push(f);
      }
    }
  }
  return out;
}

export type FunnelRow = { stepId: string; title: string; reached: number; conditional: boolean };
export type Funnel = { started: number; submitted: number; steps: FunnelRow[] };

/**
 * Drop-off funnel. A respondent "reached" a step if it was on THEIR visible path (rules
 * applied to their own answers, with their own version) up to the furthest step they
 * got to. So conditional steps are counted only for people who were shown them.
 */
export function funnel(base: FormDefinition, responses: ResponseRecord[], formForVersion: (versionId: string) => FormDefinition | undefined): Funnel {
  const counts = new Map<string, number>();
  let submitted = 0;
  for (const r of responses) {
    const form = formForVersion(r.versionId) ?? base;
    const path = computeVisibility(form, r.answers).stepOrder;
    const reachedCount = r.status === "submitted" ? path.length : Math.min(path.length, r.furthestStepIndex + 1);
    for (const stepId of path.slice(0, reachedCount)) counts.set(stepId, (counts.get(stepId) ?? 0) + 1);
    if (r.status === "submitted") submitted++;
  }
  return {
    started: responses.length,
    submitted,
    steps: base.steps.map((s) => ({ stepId: s.id, title: s.title, reached: counts.get(s.id) ?? 0, conditional: !!s.visibleIf })),
  };
}

export function completionRate(responses: ResponseRecord[]): { started: number; submitted: number; rate: number } {
  const submitted = responses.filter((r) => r.status === "submitted").length;
  return { started: responses.length, submitted, rate: responses.length ? submitted / responses.length : 0 };
}

export type ChoiceSummary = { fieldId: string; label: string; type: Field["type"]; answered: number; counts: { key: string; label: string; count: number }[] };

/** Per-question counts for choice, rating and yes/no questions (submitted responses only). */
export function choiceSummaries(fields: Field[], responses: ResponseRecord[]): ChoiceSummary[] {
  const submitted = responses.filter((r) => r.status === "submitted");
  const out: ChoiceSummary[] = [];
  for (const f of fields) {
    let buckets: { key: string; label: string }[];
    if (f.type === "singleChoice" || f.type === "dropdown" || f.type === "multipleChoice") buckets = f.options.map((o) => ({ key: o.id, label: o.label }));
    else if (f.type === "rating") buckets = Array.from({ length: f.max }, (_, i) => ({ key: String(i + 1), label: `${i + 1}` }));
    else if (f.type === "yesNo") buckets = [{ key: "true", label: "Yes" }, { key: "false", label: "No" }];
    else continue;

    const counts = new Map(buckets.map((b) => [b.key, 0]));
    let answered = 0;
    for (const r of submitted) {
      const v = r.answers[f.id];
      if (isEmptyAnswer(v)) continue;
      answered++;
      const keys = Array.isArray(v) ? v : [String(v)];
      for (const k of keys) if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
    }
    out.push({ fieldId: f.id, label: f.label, type: f.type, answered, counts: buckets.map((b) => ({ ...b, count: counts.get(b.key)! })) });
  }
  return out;
}

/**
 * One CSV cell (RFC 4180). Cells that start with = + - @ (or tab/CR) are prefixed with
 * an apostrophe so spreadsheet apps don't execute them as formulas (CSV injection).
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export function toCsv(fields: Field[], responses: ResponseRecord[], versionLabel: (versionId: string) => string): string {
  const header = ["Response ID", "Status", "Version", "Started", "Submitted", ...fields.map((f) => f.label)];
  const rows = responses.map((r) => [
    r.id,
    r.status === "submitted" ? "Submitted" : "In progress",
    versionLabel(r.versionId),
    r.startedAt,
    r.submittedAt ?? "",
    ...fields.map((f) => formatAnswer(f, r.answers[f.id])),
  ]);
  // BOM so Excel opens UTF-8 correctly; CRLF per RFC 4180.
  return "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
