"use client";

import { useObject } from "@ai-sdk/react";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Badge, Button, Card, Field, Icon, Textarea } from "@/components/ui";
import { closestTemplate, FIELD_TYPE_META, TEMPLATES, type FormDefinition } from "@/core";
import { repairForm, type RepairResult } from "@/core/ai/repair";
import { AI_LIMITS } from "@/core/ai/schemas";
import { ensureSession } from "@/lib/supabase/client";
import { aiErrorMessage, type AiErrorBody } from "@/features/ai-edit/AskAi";
import { cn } from "@/lib/cn";

/**
 * Describe -> AI drafts the form, streamed into a live outline as it's written.
 * The stream is parsed by useObject with a permissive schema; core's repairForm is the
 * real validator (partial mode while streaming, strict at the end). Any failure falls back
 * to the closest starter template, and the UI says so.
 */

const LooseObject = z.record(z.string(), z.unknown());

const EXAMPLES = [
  "A job application with name, email, phone, resume link, years of experience, and three leadership questions only if the role is Senior or above, ending with a review step.",
  "Customer feedback survey: overall rating, what they use, and a follow-up question if the rating is 2 or less.",
  "Registration for a two-day developer meetup with ticket type, dietary needs and an optional talk proposal for speakers.",
];

type Outcome =
  | { kind: "ok"; form: FormDefinition; notes: string[] }
  | { kind: "fallback"; form: FormDefinition; templateName: string; reason: string };

export function GenerateForm({ onUse, sandbox = false, busy = false }: { onUse: (form: FormDefinition) => void | Promise<void>; sandbox?: boolean; busy?: boolean }) {
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const submitted = useRef("");

  const fallback = (reason: string) => {
    const t = closestTemplate(submitted.current);
    setOutcome({ kind: "fallback", form: t.build(), templateName: t.name, reason });
  };

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/generate",
    schema: LooseObject,
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      const r = res.headers.get("x-ai-remaining");
      if (r) setRemaining(Number(r));
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as AiErrorBody;
        throw new Error(aiErrorMessage(res.status, body));
      }
      return res;
    },
    onFinish: ({ object: final, error }) => {
      if (!final) return fallback(error?.message || "The AI response was incomplete.");
      const r: RepairResult = repairForm(final);
      if (r.ok) setOutcome({ kind: "ok", form: r.form, notes: r.notes });
      else fallback(r.reason);
    },
    onError: (error) => fallback(error.message || "The AI request failed."),
  });

  // Streaming preview: repaired in partial mode so it's always renderable, with stable ids.
  const preview = useMemo(() => {
    if (!object) return null;
    const r = repairForm(object, { partial: true });
    return r.ok ? r.form : null;
  }, [object]);

  const start = async () => {
    const text = description.trim();
    if (text.length < 10 || isLoading) return;
    submitted.current = text;
    setOutcome(null);
    try {
      if (sandbox) await ensureSession();
    } catch {
      return fallback("Couldn't start a session for the AI.");
    }
    submit({ description: text });
  };

  const shown = outcome?.form ?? preview;
  const questionCount = shown?.steps.reduce((n, s) => n + s.fields.length, 0) ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
          className="flex flex-col gap-3"
        >
          <Field label="Describe your form" help="Who is it for, what should it ask, and any conditions. The AI drafts it; you refine it after.">
            <Textarea
              rows={6}
              value={description}
              maxLength={AI_LIMITS.descriptionMax}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void start();
                }
              }}
              disabled={isLoading}
              placeholder="e.g. A volunteer sign-up form with availability and skills…"
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {description.length} / {AI_LIMITS.descriptionMax}
              {remaining != null ? ` · ${remaining} AI request${remaining === 1 ? "" : "s"} left` : ""}
            </span>
            <div className="flex gap-2">
              {isLoading ? (
                <Button onClick={stop} leadingIcon={<Icon name="x" />}>
                  Stop
                </Button>
              ) : null}
              <Button type="submit" variant="primary" loading={isLoading} disabled={description.trim().length < 10} leadingIcon={<Icon name="sparkle" />}>
                {isLoading ? "Generating…" : outcome ? "Generate again" : "Generate form"}
              </Button>
            </div>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg-muted">Examples</p>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setDescription(ex)} disabled={isLoading} className="rounded-control border border-line bg-surface px-3 py-2 text-left text-sm text-fg-muted hover:border-line-strong hover:text-fg">
              {ex}
            </button>
          ))}
        </div>

        <details className="rounded-card border border-line bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">Or start without AI</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Button key={t.key} size="sm" onClick={() => onUse(t.build())} disabled={busy}>
                {t.name}
              </Button>
            ))}
          </div>
        </details>
      </div>

      <section aria-labelledby="draft-heading" aria-busy={isLoading} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="draft-heading" className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Draft
          </h2>
          <span className="text-sm text-fg-muted" aria-live="polite">
            {isLoading ? `Writing… ${questionCount} question${questionCount === 1 ? "" : "s"} so far` : outcome?.kind === "ok" ? `${questionCount} questions ready` : ""}
          </span>
        </div>

        {outcome?.kind === "fallback" ? (
          <div role="alert" className="rounded-card border border-warning bg-warning-soft p-4 text-sm">
            <p className="font-medium">The AI couldn&apos;t generate this form.</p>
            <p className="mt-1 text-fg-muted">
              {outcome.reason} We&apos;ve loaded the <strong>{outcome.templateName}</strong> template instead, so you can start from that or try again.
            </p>
          </div>
        ) : null}

        {shown ? <FormOutline form={shown} streaming={isLoading} /> : <Card className="grid min-h-64 place-items-center text-center text-sm text-fg-muted">{isLoading ? "Waiting for the first questions…" : "Your draft will appear here as the AI writes it."}</Card>}

        {outcome ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => onUse(outcome.form)} loading={busy}>
              {outcome.kind === "ok" ? "Use this form" : `Use ${outcome.templateName}`}
            </Button>
            {outcome.kind === "fallback" ? (
              <Button onClick={() => onUse(TEMPLATES[0].build())} disabled={busy}>
                Start blank
              </Button>
            ) : null}
            {outcome.kind === "ok" && outcome.notes.length ? (
              <details className="text-sm text-fg-muted">
                <summary className="cursor-pointer">{outcome.notes.length} automatic fix{outcome.notes.length === 1 ? "" : "es"}</summary>
                <ul className="mt-2 list-disc pl-5">
                  {outcome.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FormOutline({ form, streaming }: { form: FormDefinition; streaming: boolean }) {
  return (
    <Card className={cn("flex flex-col gap-4", streaming && "border-accent")}>
      <div>
        <p className="text-lg font-semibold">{form.title}</p>
        {form.description ? <p className="text-sm text-fg-muted">{form.description}</p> : null}
      </div>
      <ol className="flex flex-col gap-3">
        {form.steps.map((s, i) => (
          <li key={s.id} className="animate-fade rounded-control border border-line p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-fg-muted tabular-nums">{i + 1}.</span> {s.title}
              {s.kind === "review" ? <Badge>Review</Badge> : null}
              {s.visibleIf ? <Badge tone="accent">Conditional</Badge> : null}
            </p>
            {s.fields.length ? (
              <ul className="mt-2 flex flex-col gap-1">
                {s.fields.map((f) => (
                  <li key={f.id} className="flex animate-fade items-center gap-2 text-sm">
                    <span className="flex-1">
                      {f.label}
                      {f.required ? <span className="text-danger"> *</span> : null}
                    </span>
                    {f.visibleIf ? <Icon name="rule" className="text-accent" label="Conditional" /> : null}
                    <span className="text-xs text-fg-muted">{FIELD_TYPE_META[f.type].label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
