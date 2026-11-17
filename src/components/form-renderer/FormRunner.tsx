"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { Button, Card, Icon, ProgressBar } from "@/components/ui";
import {
  buildStepSchema,
  computeVisibility,
  validateSubmission,
  type Answers,
  type Condition,
  type FormDefinition,
} from "@/core";
import { cn } from "@/lib/cn";
import { ErrorSummary } from "./ErrorSummary";
import { FieldControl, fieldDomId } from "./FieldControl";
import { ReviewStep } from "./ReviewStep";

export type SubmitOutcome = { ok: true } | { ok: false; message?: string; errors?: Record<string, string>; firstInvalidStepId?: string | null };
export type Progress = { stepId: string; furthestIndex: number };

export type FormRunnerProps = {
  form: FormDefinition;
  /** "preview" = editor / publish preview: nothing is persisted. */
  mode: "live" | "preview";
  initialAnswers?: Answers;
  initialStepId?: string | null;
  initialFurthestIndex?: number;
  /** Controlled current step (the editor preview follows the selected step). */
  stepId?: string;
  onStepChange?: (stepId: string) => void;
  /** Fires on every answer change and step change (autosave hooks in here). */
  onProgress?: (answers: Answers, progress: Progress) => void;
  onSubmit: (answers: Answers) => Promise<SubmitOutcome>;
  onRestart?: () => void;
  highlightFieldIds?: ReadonlySet<string>;
  /** Rendered next to the progress bar (e.g. the autosave indicator). */
  statusSlot?: ReactNode;
  /** Rendered under the navigation (e.g. "Save and continue later"). */
  footerSlot?: ReactNode;
  className?: string;
};

function ruleDependencies(form: FormDefinition): string[] {
  const ids = new Set<string>();
  const add = (c?: Condition) => c && ("all" in c ? c.all : c.any).forEach((cl) => ids.add(cl.fieldId));
  for (const s of form.steps) {
    add(s.visibleIf);
    s.fields.forEach((f) => add(f.visibleIf));
  }
  return [...ids];
}

export function FormRunner(props: FormRunnerProps) {
  const { form, mode, initialAnswers, onSubmit, onProgress, onRestart, highlightFieldIds, statusSlot, footerSlot, className } = props;

  // The resolver must see the latest form and step; RHF calls it on submit/re-validate.
  const latest = useRef({ form, stepId: "" });

  const resolver: Resolver<Answers> = (values, context, options) => {
    const { form: f, stepId } = latest.current;
    return zodResolver(buildStepSchema(f, stepId, values))(values, context, options as never) as ReturnType<Resolver<Answers>>;
  };

  const rhf = useForm<Answers>({
    defaultValues: initialAnswers ?? {},
    resolver,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: false, // we focus the error summary instead
    shouldUnregister: false, // keep answers to fields that get hidden, so un-hiding restores them
  });
  const { control, handleSubmit, getValues, setError, clearErrors, subscribe } = rhf;

  // Re-render the runner only when a field that rules depend on changes.
  const deps = useMemo(() => ruleDependencies(form), [form]);
  const depValues = useWatch({ control, name: deps });
  const visibility = useMemo(() => {
    const subset: Answers = {};
    deps.forEach((id, i) => (subset[id] = depValues[i] as Answers[string]));
    return computeVisibility(form, subset);
  }, [form, deps, depValues]);
  const path = visibility.stepOrder;

  const [uncontrolledStep, setUncontrolledStep] = useState(() => (props.initialStepId && path.includes(props.initialStepId) ? props.initialStepId : path[0]!));
  const requested = props.stepId ?? uncontrolledStep;
  const stepId = path.includes(requested) ? requested : (path[0] ?? form.steps[0]!.id);
  const stepIndex = Math.max(0, path.indexOf(stepId));
  const step = form.steps.find((s) => s.id === stepId)!;
  const isLast = stepIndex === path.length - 1;

  useEffect(() => {
    latest.current = { form, stepId };
  }, [form, stepId]);

  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [furthest, setFurthest] = useState(props.initialFurthestIndex ?? 0);
  const [focusKey, setFocusKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const { errors } = useFormState({ control });
  const stepFields = step.fields.filter((f) => visibility.fields.has(f.id));
  const stepErrors: Record<string, string> = {};
  for (const f of stepFields) {
    const m = errors[f.id]?.message;
    if (typeof m === "string") stepErrors[f.id] = m;
  }

  // Report answer changes (autosave). Subscribes outside React rendering: no re-renders.
  const progressRef = useRef<Progress>({ stepId, furthestIndex: furthest });
  useEffect(() => {
    progressRef.current = { stepId, furthestIndex: furthest };
    if (!firstRender.current) onProgress?.(getValues(), progressRef.current);
  }, [stepId, furthest, onProgress, getValues]);
  useEffect(() => {
    if (!onProgress) return;
    // subscribe() listens to value changes without re-rendering this component.
    return subscribe({ formState: { values: true }, callback: ({ values }) => onProgress(values, progressRef.current) });
  }, [subscribe, onProgress]);

  // Move focus to the step heading on step change (not on first load: don't steal focus).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: false });
  }, [stepId]);

  const goTo = (id: string, dir: "forward" | "back") => {
    clearErrors();
    setSubmitError(null);
    setDirection(dir);
    const idx = path.indexOf(id);
    if (idx > furthest) setFurthest(idx);
    setUncontrolledStep(id);
    props.onStepChange?.(id);
  };

  const submitAll = async () => {
    const answers = getValues();
    const check = validateSubmission(form, answers);
    if (!check.success) {
      if (check.firstInvalidStepId && check.firstInvalidStepId !== stepId) goTo(check.firstInvalidStepId, "back");
      Object.entries(check.errors).forEach(([id, message]) => setError(id, { type: "validate", message }));
      setFocusKey((k) => k + 1);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await onSubmit(answers);
      if (outcome.ok) {
        setSubmitted(true);
        return;
      }
      if (outcome.firstInvalidStepId && outcome.firstInvalidStepId !== stepId) goTo(outcome.firstInvalidStepId, "back");
      Object.entries(outcome.errors ?? {}).forEach(([id, message]) => setError(id, { type: "server", message }));
      setSubmitError(outcome.message ?? (outcome.errors ? null : "Couldn't submit. Please try again."));
      setFocusKey((k) => k + 1);
    } catch {
      setSubmitError("Couldn't submit. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onNext = handleSubmit(
    async () => {
      if (isLast) return submitAll();
      goTo(path[stepIndex + 1]!, "forward");
    },
    () => setFocusKey((k) => k + 1),
  );

  if (submitted) {
    return (
      <Card className={cn("flex animate-enter flex-col items-center gap-3 py-12 text-center", className)}>
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <Icon name="check" className="size-6" />
        </span>
        <h2 className="text-xl font-semibold" tabIndex={-1} ref={(el) => el?.focus()}>
          {form.settings.confirmation.title}
        </h2>
        {form.settings.confirmation.message ? <p className="max-w-md text-fg-muted">{form.settings.confirmation.message}</p> : null}
        {onRestart ? (
          <Button className="mt-2" onClick={onRestart}>
            {mode === "preview" ? "Restart preview" : "Submit another response"}
          </Button>
        ) : null}
      </Card>
    );
  }

  return (
    <form noValidate onSubmit={onNext} className={cn("flex flex-col gap-6", className)} aria-labelledby="step-heading">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span>
            Step {stepIndex + 1} of {path.length}
          </span>
          {statusSlot}
        </div>
        <ProgressBar value={stepIndex + (submitted ? 1 : 0)} max={Math.max(1, path.length - 1)} label="Form progress" />
      </div>

      <div key={stepId} className={cn("flex flex-col gap-6", direction === "forward" ? "animate-enter" : "animate-enter-back")}>
        <div className="flex flex-col gap-1">
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight focus-visible:outline-offset-4">
            <span className="sr-only">
              Step {stepIndex + 1} of {path.length}:{" "}
            </span>
            {step.title}
          </h2>
          {step.description ? <p className="text-fg-muted">{step.description}</p> : null}
        </div>

        <ErrorSummary errors={stepErrors} fields={stepFields} focusKey={focusKey} />
        {submitError ? (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        ) : null}

        {step.kind === "review" ? (
          <ReviewStep
            form={form}
            answers={getValues()}
            visibility={computeVisibility(form, getValues())}
            onEdit={(sid, fid) => {
              goTo(sid, "back");
              requestAnimationFrame(() => document.getElementById(fieldDomId(fid))?.scrollIntoView({ block: "center" }));
            }}
          />
        ) : stepFields.length ? (
          <div className="flex flex-col gap-6">
            {stepFields.map((f) => (
              <FieldControl key={f.id} field={f} control={control} highlighted={highlightFieldIds?.has(f.id)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">No questions on this step yet.</p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
        {stepIndex > 0 ? (
          <Button onClick={() => goTo(path[stepIndex - 1]!, "back")} leadingIcon={<Icon name="chevronLeft" />}>
            Back
          </Button>
        ) : null}
        <div className="flex-1">{footerSlot}</div>
        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          {isLast ? form.settings.submitLabel : "Next"}
          {!isLast ? <Icon name="chevronRight" /> : null}
        </Button>
      </div>
    </form>
  );
}
