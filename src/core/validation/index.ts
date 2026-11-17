import { z } from "zod";
import type { Answers, Field, FormDefinition } from "../schema/definition";
import { computeVisibility, pruneHiddenAnswers, type Visibility } from "../rules/engine";

/**
 * Runtime validator: builds Zod schemas from a form definition.
 *
 * The SAME functions run in the browser (per step, via React Hook Form's zodResolver)
 * and on the server at submit (whole response, against the published version).
 * Because visibility depends on answers, schemas are built for a given set of answers:
 * only visible fields are validated, and hidden answers are pruned first.
 */

export const MESSAGES = {
  required: "This question is required.",
  choose: "Choose an option.",
  chooseOne: "Choose at least one option.",
  email: "Enter a valid email address, like name@example.com.",
  url: "Enter a valid link, like https://example.com.",
  phone: "Enter a valid phone number (7 to 15 digits).",
  number: "Enter a number.",
  integer: "Enter a whole number.",
  date: "Enter a valid date.",
  rating: "Choose a rating from 1 to 5.",
  yesNo: "Choose yes or no.",
} as const;

const emptyToUndefined = (v: unknown) => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  if (Array.isArray(v) && v.length === 0) return undefined;
  if (typeof v === "number" && Number.isNaN(v)) return undefined;
  return v;
};

const trimString = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** Accept "example.com/x" and add https://, a common respondent shortcut. */
const normaliseUrl = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t && !/^[a-z][a-z0-9+.-]*:/i.test(t) ? `https://${t}` : t;
};

const toNumber = (v: unknown) => {
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return undefined;
    const n = Number(t);
    // Keep unparseable input as-is so it fails as "Enter a number", not as "required".
    return Number.isNaN(n) ? v : n;
  }
  return v;
};

const PHONE_CHARS = /^\+?[0-9\s().-]+$/;

/** Schema for a single field's answer, with empty -> undefined and required handling. */
export function answerSchema(field: Field): z.ZodType {
  const requiredError = (fallback: string) => ({
    error: (iss: { input?: unknown }) => (iss.input === undefined ? MESSAGES.required : fallback),
  });

  let inner: z.ZodType;
  let pre: (v: unknown) => unknown = (v) => emptyToUndefined(trimString(v));

  switch (field.type) {
    case "shortText":
    case "longText": {
      let s = z.string(requiredError("Enter text."));
      if (field.minLength != null)
        s = s.min(field.minLength, `Use at least ${field.minLength} characters.`);
      if (field.maxLength != null)
        s = s.max(field.maxLength, `Use at most ${field.maxLength} characters.`);
      else s = s.max(10_000, "That's too long.");
      if (field.type === "shortText" && field.pattern) {
        // Pattern was validated when the form was saved; guard anyway.
        let re: RegExp | null = null;
        try {
          re = new RegExp(field.pattern.regex);
        } catch {
          re = null;
        }
        if (re) s = s.regex(re, field.pattern.message);
      }
      inner = s;
      break;
    }
    case "email":
      inner = z.email(requiredError(MESSAGES.email));
      break;
    case "url":
      pre = (v) => emptyToUndefined(normaliseUrl(v));
      inner = z.httpUrl(requiredError(MESSAGES.url)).max(2048, "That link is too long.");
      break;
    case "phone":
      inner = z
        .string(requiredError(MESSAGES.phone))
        .regex(PHONE_CHARS, MESSAGES.phone)
        .refine((s) => {
          const digits = s.replace(/\D/g, "").length;
          return digits >= 7 && digits <= 15;
        }, MESSAGES.phone);
      break;
    case "number": {
      pre = (v) => emptyToUndefined(toNumber(v));
      let n = z.number(requiredError(MESSAGES.number));
      if (field.integer) n = n.int(MESSAGES.integer);
      if (field.min != null) n = n.min(field.min, `Enter ${field.min} or more.`);
      if (field.max != null) n = n.max(field.max, `Enter ${field.max} or less.`);
      inner = n;
      break;
    }
    case "rating":
      pre = (v) => emptyToUndefined(toNumber(v));
      inner = z
        .int(requiredError(MESSAGES.rating))
        .min(1, MESSAGES.rating)
        .max(field.max, MESSAGES.rating);
      break;
    case "date": {
      let d = z.iso.date(requiredError(MESSAGES.date));
      if (field.minDate)
        d = d.refine((v) => v >= field.minDate!, `Choose ${field.minDate} or later.`);
      if (field.maxDate)
        d = d.refine((v) => v <= field.maxDate!, `Choose ${field.maxDate} or earlier.`);
      inner = d;
      break;
    }
    case "singleChoice":
    case "dropdown": {
      const ids = field.options.map((o) => o.id);
      inner = z
        .string(requiredError(MESSAGES.choose))
        .refine((v) => ids.includes(v), MESSAGES.choose);
      break;
    }
    case "multipleChoice": {
      const ids = field.options.map((o) => o.id);
      pre = (v) => emptyToUndefined(Array.isArray(v) ? [...new Set(v)] : v);
      let a = z.array(
        z.string().refine((v) => ids.includes(v), MESSAGES.choose),
        requiredError(MESSAGES.chooseOne),
      );
      if (field.minSelected != null && field.minSelected > 0)
        a = a.min(field.minSelected, `Choose at least ${field.minSelected}.`);
      if (field.maxSelected != null)
        a = a.max(field.maxSelected, `Choose at most ${field.maxSelected}.`);
      inner = a;
      break;
    }
    case "yesNo":
      pre = (v) => (v === "true" ? true : v === "false" ? false : emptyToUndefined(v));
      inner = z.boolean(requiredError(MESSAGES.yesNo));
      break;
  }

  return z.preprocess(pre, field.required ? inner : inner.optional());
}

function objectFor(fields: Field[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) shape[f.id] = answerSchema(f);
  return z.object(shape);
}

/** Schema for one step: the step's currently visible fields only. */
export function buildStepSchema(
  form: FormDefinition,
  stepId: string,
  answers: Answers,
  visibility: Visibility = computeVisibility(form, answers),
): z.ZodObject {
  const step = form.steps.find((s) => s.id === stepId);
  if (!step || !visibility.steps.has(step.id)) return z.object({});
  return objectFor(step.fields.filter((f) => visibility.fields.has(f.id)));
}

/** Schema for a whole submission: every visible field across the visible path. Unknown keys are stripped. */
export function buildSubmissionSchema(
  form: FormDefinition,
  answers: Answers,
  visibility: Visibility = computeVisibility(form, answers),
): z.ZodObject {
  const fields = form.steps.flatMap((s) => s.fields).filter((f) => visibility.fields.has(f.id));
  return objectFor(fields);
}

export type FieldErrors = Record<string, string>;

export type ValidationResult =
  | { success: true; data: Answers }
  | { success: false; errors: FieldErrors; firstInvalidStepId: string | null };

function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validateStep(
  form: FormDefinition,
  stepId: string,
  answers: Answers,
): ValidationResult {
  const r = buildStepSchema(form, stepId, answers).safeParse(answers);
  if (r.success) return { success: true, data: r.data as Answers };
  return { success: false, errors: toFieldErrors(r.error), firstInvalidStepId: stepId };
}

/**
 * Server-side (and pre-submit client-side) check of a full response.
 * Prunes hidden answers, then validates every visible field. `data` is what gets stored.
 */
export function validateSubmission(form: FormDefinition, answers: Answers): ValidationResult {
  const visibility = computeVisibility(form, answers);
  const pruned = pruneHiddenAnswers(form, answers, visibility);
  const r = buildSubmissionSchema(form, pruned, visibility).safeParse(pruned);
  if (r.success) {
    // Drop keys whose value parsed to undefined (optional and empty).
    const data: Answers = {};
    for (const [k, v] of Object.entries(r.data))
      if (v !== undefined) data[k] = v as Answers[string];
    return { success: true, data };
  }
  const errors = toFieldErrors(r.error);
  const firstInvalidStepId =
    form.steps.find((s) => visibility.steps.has(s.id) && s.fields.some((f) => f.id in errors))
      ?.id ?? null;
  return { success: false, errors, firstInvalidStepId };
}
