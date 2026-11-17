import { z } from "zod";
import { ID_PATTERN } from "./ids";

/**
 * The form definition: form -> steps -> fields, with optional visibility conditions.
 *
 * Stored nested (readable, portable, what humans and the AI think in). The editor
 * normalises it into id-keyed maps for fine-grained updates and denormalises it on save.
 */

export const SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  titleMax: 120,
  labelMax: 300,
  helpMax: 500,
  placeholderMax: 120,
  optionLabelMax: 120,
  stepsMax: 30,
  fieldsPerStepMax: 50,
  optionsMax: 50,
  clausesMax: 10,
  textMax: 10_000,
} as const;

export const Id = z.string().regex(ID_PATTERN, "Invalid id");

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export const OPERATORS = [
  "equals",
  "notEquals",
  "in",
  "notIn",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
  "isAnswered",
  "isEmpty",
] as const;
export const Operator = z.enum(OPERATORS);
export type Operator = z.infer<typeof Operator>;

export const ClauseValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
export type ClauseValue = z.infer<typeof ClauseValue>;

export const Clause = z.object({
  fieldId: Id,
  op: Operator,
  value: ClauseValue.optional(),
});
export type Clause = z.infer<typeof Clause>;

/** `all` = AND, `any` = OR. One level only: enough for real forms and easy to edit in a UI. */
export const Condition = z.union([
  z.object({ all: z.array(Clause).min(1).max(LIMITS.clausesMax) }),
  z.object({ any: z.array(Clause).min(1).max(LIMITS.clausesMax) }),
]);
export type Condition = z.infer<typeof Condition>;

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export const FIELD_TYPES = [
  "shortText",
  "longText",
  "email",
  "phone",
  "number",
  "singleChoice",
  "multipleChoice",
  "dropdown",
  "date",
  "url",
  "rating",
  "yesNo",
] as const;
export const FieldType = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldType>;

export const ChoiceOption = z.object({
  id: Id,
  label: z.string().trim().min(1, "Option label is required").max(LIMITS.optionLabelMax),
});
export type ChoiceOption = z.infer<typeof ChoiceOption>;

const base = {
  id: Id,
  label: z.string().trim().min(1, "Label is required").max(LIMITS.labelMax),
  helpText: z.string().max(LIMITS.helpMax).optional(),
  required: z.boolean(),
  visibleIf: Condition.optional(),
};
const placeholder = z.string().max(LIMITS.placeholderMax).optional();
const options = z.array(ChoiceOption).min(1, "Add at least one option").max(LIMITS.optionsMax);
const isoDate = z.iso.date();

export const ShortTextField = z.object({
  ...base,
  type: z.literal("shortText"),
  placeholder,
  minLength: z.int().min(0).max(LIMITS.textMax).optional(),
  maxLength: z.int().min(1).max(LIMITS.textMax).optional(),
  pattern: z
    .object({ regex: z.string().min(1).max(200), message: z.string().min(1).max(200) })
    .optional(),
});
export const LongTextField = z.object({
  ...base,
  type: z.literal("longText"),
  placeholder,
  minLength: z.int().min(0).max(LIMITS.textMax).optional(),
  maxLength: z.int().min(1).max(LIMITS.textMax).optional(),
});
export const EmailField = z.object({ ...base, type: z.literal("email"), placeholder });
export const PhoneField = z.object({ ...base, type: z.literal("phone"), placeholder });
export const UrlField = z.object({ ...base, type: z.literal("url"), placeholder });
export const NumberField = z.object({
  ...base,
  type: z.literal("number"),
  placeholder,
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
});
export const SingleChoiceField = z.object({ ...base, type: z.literal("singleChoice"), options });
export const DropdownField = z.object({
  ...base,
  type: z.literal("dropdown"),
  options,
  placeholder,
});
export const MultipleChoiceField = z.object({
  ...base,
  type: z.literal("multipleChoice"),
  options,
  minSelected: z.int().min(0).max(LIMITS.optionsMax).optional(),
  maxSelected: z.int().min(1).max(LIMITS.optionsMax).optional(),
});
export const DateField = z.object({
  ...base,
  type: z.literal("date"),
  minDate: isoDate.optional(),
  maxDate: isoDate.optional(),
});
export const RatingField = z.object({
  ...base,
  type: z.literal("rating"),
  max: z.literal(5),
  lowLabel: z.string().max(40).optional(),
  highLabel: z.string().max(40).optional(),
});
export const YesNoField = z.object({ ...base, type: z.literal("yesNo") });

/** Per-type schemas, keyed by type. The registry derives allowed keys from these shapes. */
export const FIELD_SCHEMAS = {
  shortText: ShortTextField,
  longText: LongTextField,
  email: EmailField,
  phone: PhoneField,
  number: NumberField,
  singleChoice: SingleChoiceField,
  multipleChoice: MultipleChoiceField,
  dropdown: DropdownField,
  date: DateField,
  url: UrlField,
  rating: RatingField,
  yesNo: YesNoField,
} as const satisfies Record<FieldType, z.ZodObject>;

/**
 * Discriminated union on `type`: each type carries only its own validation options,
 * so nonsense like `min` on an email field can't be expressed.
 */
export const FieldSchema = z
  .discriminatedUnion("type", [
    ShortTextField,
    LongTextField,
    EmailField,
    PhoneField,
    NumberField,
    SingleChoiceField,
    MultipleChoiceField,
    DropdownField,
    DateField,
    UrlField,
    RatingField,
    YesNoField,
  ])
  .superRefine((f, ctx) => {
    if (
      (f.type === "shortText" || f.type === "longText") &&
      f.minLength != null &&
      f.maxLength != null &&
      f.minLength > f.maxLength
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minLength"],
        message: "Min length is greater than max length",
      });
    }
    if (f.type === "shortText" && f.pattern) {
      try {
        new RegExp(f.pattern.regex);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["pattern", "regex"],
          message: "Invalid regular expression",
        });
      }
    }
    if (f.type === "number" && f.min != null && f.max != null && f.min > f.max) {
      ctx.addIssue({ code: "custom", path: ["min"], message: "Min is greater than max" });
    }
    if (f.type === "multipleChoice") {
      if (f.minSelected != null && f.maxSelected != null && f.minSelected > f.maxSelected) {
        ctx.addIssue({
          code: "custom",
          path: ["minSelected"],
          message: "Min selections is greater than max",
        });
      }
      if (f.maxSelected != null && f.maxSelected > f.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["maxSelected"],
          message: "Max selections exceeds the number of options",
        });
      }
    }
    if (f.type === "date" && f.minDate && f.maxDate && f.minDate > f.maxDate) {
      ctx.addIssue({
        code: "custom",
        path: ["minDate"],
        message: "Earliest date is after latest date",
      });
    }
    if ("options" in f) {
      const seen = new Set<string>();
      f.options.forEach((o, i) => {
        if (seen.has(o.id))
          ctx.addIssue({
            code: "custom",
            path: ["options", i, "id"],
            message: "Duplicate option id",
          });
        seen.add(o.id);
      });
    }
  });
export type Field = z.infer<typeof FieldSchema>;
export type FieldOf<T extends FieldType> = Extract<Field, { type: T }>;
export type ChoiceField = FieldOf<"singleChoice" | "multipleChoice" | "dropdown">;

// ---------------------------------------------------------------------------
// Steps and form
// ---------------------------------------------------------------------------

export const StepKind = z.enum(["questions", "review"]);
export type StepKind = z.infer<typeof StepKind>;

export const StepSchema = z.object({
  id: Id,
  title: z.string().trim().min(1, "Step title is required").max(LIMITS.titleMax),
  description: z.string().max(LIMITS.helpMax).optional(),
  kind: StepKind,
  visibleIf: Condition.optional(),
  fields: z.array(FieldSchema).max(LIMITS.fieldsPerStepMax),
});
export type Step = z.infer<typeof StepSchema>;

export const FormSettings = z.object({
  submitLabel: z.string().trim().min(1).max(40),
  confirmation: z.object({
    title: z.string().trim().min(1).max(LIMITS.titleMax),
    message: z.string().max(LIMITS.helpMax),
  }),
});
export type FormSettings = z.infer<typeof FormSettings>;

/**
 * Structural shape only. Cross-reference checks (unique ids, rule references, cycles)
 * live in `validateForm` so they can produce editor-friendly issues instead of
 * failing the parse.
 */
export const FormDefinitionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().trim().min(1, "Form title is required").max(LIMITS.titleMax),
  description: z.string().max(LIMITS.helpMax).optional(),
  steps: z.array(StepSchema).min(1).max(LIMITS.stepsMax),
  settings: FormSettings,
});
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Answer values by field type:
 * text-like and date -> string (date is yyyy-mm-dd), number/rating -> number,
 * single choice/dropdown -> option id, multiple choice -> option ids, yes/no -> boolean.
 * Choice answers store option ids, not labels, so renaming an option never corrupts data.
 */
export const AnswerValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;
export const AnswersSchema = z.record(z.string(), AnswerValue);
export type Answers = Record<string, AnswerValue | undefined>;
