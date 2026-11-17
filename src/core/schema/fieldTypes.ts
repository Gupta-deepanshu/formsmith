import {
  FIELD_SCHEMAS,
  type ChoiceOption,
  type Field,
  type FieldType,
  type Operator,
} from "./definition";
import { createId } from "./ids";

/**
 * Field-type registry: one entry per type. Adding a field type means adding a schema
 * in definition.ts, an entry here, and a renderer in the UI.
 */

export type AnswerKind = "text" | "number" | "date" | "choice" | "choices" | "boolean";

type FieldTypeMeta = {
  label: string;
  answerKind: AnswerKind;
  operators: readonly Operator[];
  create: (id: string, label: string) => Field;
};

const TEXT_OPS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "isAnswered",
  "isEmpty",
] as const;
const ORDERED_OPS = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
  "isAnswered",
  "isEmpty",
] as const;
const CHOICE_OPS = ["equals", "notEquals", "in", "notIn", "isAnswered", "isEmpty"] as const;
const CHOICES_OPS = ["contains", "notContains", "in", "notIn", "isAnswered", "isEmpty"] as const;
const BOOL_OPS = ["equals", "isAnswered", "isEmpty"] as const;

export function defaultOptions(): ChoiceOption[] {
  return [
    { id: createId("o"), label: "Option 1" },
    { id: createId("o"), label: "Option 2" },
  ];
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  shortText: {
    label: "Short text",
    answerKind: "text",
    operators: TEXT_OPS,
    create: (id, label) => ({ id, label, type: "shortText", required: false }),
  },
  longText: {
    label: "Long text",
    answerKind: "text",
    operators: TEXT_OPS,
    create: (id, label) => ({ id, label, type: "longText", required: false }),
  },
  email: {
    label: "Email",
    answerKind: "text",
    operators: TEXT_OPS,
    create: (id, label) => ({ id, label, type: "email", required: false }),
  },
  phone: {
    label: "Phone",
    answerKind: "text",
    operators: TEXT_OPS,
    create: (id, label) => ({ id, label, type: "phone", required: false }),
  },
  url: {
    label: "URL",
    answerKind: "text",
    operators: TEXT_OPS,
    create: (id, label) => ({ id, label, type: "url", required: false }),
  },
  number: {
    label: "Number",
    answerKind: "number",
    operators: ORDERED_OPS,
    create: (id, label) => ({ id, label, type: "number", required: false }),
  },
  date: {
    label: "Date",
    answerKind: "date",
    operators: ORDERED_OPS,
    create: (id, label) => ({ id, label, type: "date", required: false }),
  },
  rating: {
    label: "Rating (1–5)",
    answerKind: "number",
    operators: ORDERED_OPS,
    create: (id, label) => ({ id, label, type: "rating", required: false, max: 5 }),
  },
  singleChoice: {
    label: "Single choice",
    answerKind: "choice",
    operators: CHOICE_OPS,
    create: (id, label) => ({
      id,
      label,
      type: "singleChoice",
      required: false,
      options: defaultOptions(),
    }),
  },
  dropdown: {
    label: "Dropdown",
    answerKind: "choice",
    operators: CHOICE_OPS,
    create: (id, label) => ({
      id,
      label,
      type: "dropdown",
      required: false,
      options: defaultOptions(),
    }),
  },
  multipleChoice: {
    label: "Multiple choice",
    answerKind: "choices",
    operators: CHOICES_OPS,
    create: (id, label) => ({
      id,
      label,
      type: "multipleChoice",
      required: false,
      options: defaultOptions(),
    }),
  },
  yesNo: {
    label: "Yes / No",
    answerKind: "boolean",
    operators: BOOL_OPS,
    create: (id, label) => ({ id, label, type: "yesNo", required: false }),
  },
};

export function isChoiceField(f: Field): f is Extract<Field, { options: ChoiceOption[] }> {
  return f.type === "singleChoice" || f.type === "multipleChoice" || f.type === "dropdown";
}

export function newField(type: FieldType, label = "Untitled question"): Field {
  return FIELD_TYPE_META[type].create(createId("f"), label);
}

/** Keys a field of `type` may carry, derived from its Zod shape so the two never drift. */
export function allowedKeys(type: FieldType): ReadonlySet<string> {
  return new Set(Object.keys(FIELD_SCHEMAS[type].shape));
}

/**
 * Coerce an arbitrary record into the shape of `type`: drop keys the type doesn't
 * allow and fill required type-specific keys with defaults. Used after a type change
 * (e.g. dropdown -> short text drops `options`; short text -> dropdown adds options).
 * Keeps everything that is still meaningful, so changing type back and forth via undo
 * restores the original exactly (undo restores dropped keys explicitly).
 */
export function normaliseFieldShape(
  raw: Record<string, unknown>,
  type: FieldType,
): Record<string, unknown> {
  const keys = allowedKeys(type);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (keys.has(k) && v !== undefined) out[k] = v;
  }
  out.type = type;
  if (keys.has("options") && !Array.isArray(out.options)) out.options = defaultOptions();
  if (type === "rating") out.max = 5;
  if (typeof out.required !== "boolean") out.required = false;
  return out;
}
