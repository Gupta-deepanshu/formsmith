"use client";

import { formatAnswer, type Answers, type FormDefinition, type Visibility } from "@/core";

/** Summary of the respondent's visible answers, grouped by step, with "Change" links. */
export function ReviewStep({ form, answers, visibility, onEdit }: { form: FormDefinition; answers: Answers; visibility: Visibility; onEdit: (stepId: string, fieldId: string) => void }) {
  const steps = form.steps.filter((s) => s.kind === "questions" && visibility.steps.has(s.id));
  return (
    <div className="flex flex-col gap-6">
      {steps.map((step) => {
        const fields = step.fields.filter((f) => visibility.fields.has(f.id));
        if (!fields.length) return null;
        return (
          <section key={step.id} aria-labelledby={`review-${step.id}`}>
            <h3 id={`review-${step.id}`} className="mb-2 text-sm font-semibold text-fg-muted">
              {step.title}
            </h3>
            <dl className="divide-y divide-line rounded-card border border-line">
              {fields.map((f) => {
                const text = formatAnswer(f, answers[f.id]);
                return (
                  <div key={f.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <dt className="text-sm text-fg-muted sm:w-2/5">{f.label}</dt>
                    <dd className="flex flex-1 items-start justify-between gap-3 text-sm">
                      <span className={text ? "break-words whitespace-pre-wrap text-fg" : "text-fg-muted italic"}>{text || "Not answered"}</span>
                      <button type="button" onClick={() => onEdit(step.id, f.id)} className="shrink-0 rounded-control px-1 text-accent underline-offset-2 hover:underline">
                        Change<span className="sr-only"> {f.label}</span>
                      </button>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
