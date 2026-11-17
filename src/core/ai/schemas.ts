import { z } from "zod";
import { FIELD_TYPES, OPERATORS } from "../schema/definition";

/**
 * Schemas the MODEL fills in. Deliberately flatter and looser than FormDefinition:
 * - one field object with optional per-type keys instead of a 12-way discriminated union
 *   (Gemini structured output accepts only a JSON Schema subset and rejects big unions);
 * - choice options as plain labels, rule values as strings (labels for choices);
 * - ids are suggestions. `repair.ts` turns this into a strict FormDefinition or patch
 *   ops, deterministically, and that's where correctness is enforced (and unit-tested).
 */

export const AI_LIMITS = { descriptionMax: 2000, instructionMax: 500 } as const;

const AiClause = z.object({
  questionId: z.string().describe("id of an EARLIER question this rule depends on"),
  operator: z.enum(OPERATORS),
  value: z
    .string()
    .optional()
    .describe(
      "comparison value; for choice questions use the option label; for yes/no use 'true' or 'false'",
    ),
  values: z.array(z.string()).optional().describe("for operators 'in' / 'notIn': option labels"),
});

const AiCondition = z.object({
  match: z.enum(["all", "any"]),
  rules: z.array(AiClause),
});

export const AiField = z.object({
  id: z.string().describe("short snake_case id, unique within the form, e.g. 'years_experience'"),
  type: z.enum(FIELD_TYPES),
  label: z.string(),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean(),
  options: z
    .array(z.string())
    .optional()
    .describe("option labels, only for singleChoice, multipleChoice and dropdown"),
  min: z.number().optional().describe("number: minimum value"),
  max: z.number().optional().describe("number: maximum value"),
  integer: z.boolean().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  showIf: AiCondition.optional().describe("show this question only when the condition holds"),
});
export type AiField = z.infer<typeof AiField>;

export const AiStep = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  kind: z
    .enum(["questions", "review"])
    .describe("'review' = a final step summarising answers; it has no questions"),
  showIf: AiCondition.optional().describe(
    "show this whole step only when the condition holds (rules may only use questions from earlier steps)",
  ),
  questions: z.array(AiField),
});

export const AiFormSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(AiStep),
  submitLabel: z.string().optional(),
  confirmationMessage: z.string().optional(),
});
export type AiForm = z.infer<typeof AiFormSchema>;

const AiFieldChanges = AiField.omit({ id: true }).partial();

export const AiEditOp = z.object({
  op: z.enum([
    "addQuestion",
    "updateQuestion",
    "removeQuestion",
    "moveQuestion",
    "addStep",
    "updateStep",
    "removeStep",
    "moveStep",
    "updateForm",
  ]),
  questionId: z.string().optional().describe("existing question id (update/remove/move)"),
  stepId: z
    .string()
    .optional()
    .describe("existing step id: where to add a question, or the step to update/remove/move"),
  position: z
    .number()
    .optional()
    .describe("0-based position within the step (questions) or the form (steps); omit for the end"),
  targetStepId: z.string().optional().describe("moveQuestion: destination step id"),
  question: AiField.optional().describe("addQuestion: the new question"),
  changes: AiFieldChanges.optional().describe(
    "updateQuestion: only the properties that change. Use an empty string to clear text",
  ),
  step: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      kind: z.enum(["questions", "review"]).optional(),
      showIf: AiCondition.optional(),
      questions: z.array(AiField).optional(),
    })
    .optional()
    .describe("addStep / updateStep"),
  form: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      submitLabel: z.string().optional(),
    })
    .optional()
    .describe("updateForm"),
});
export type AiEditOp = z.infer<typeof AiEditOp>;

export const AiEditSchema = z.object({
  summary: z.string().describe("one short sentence describing the change"),
  ops: z.array(AiEditOp),
});
export type AiEdit = z.infer<typeof AiEditSchema>;
