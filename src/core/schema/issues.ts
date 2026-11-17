/** An editor-facing problem with a form definition. Errors block publish; warnings don't. */
export type FormIssue = {
  severity: "error" | "warning";
  code:
    | "schema"
    | "duplicateId"
    | "review.notLast"
    | "review.multiple"
    | "review.hasFields"
    | "noQuestions"
    | "emptyStep"
    | "rule.unknownField"
    | "rule.badOperator"
    | "rule.missingValue"
    | "rule.unknownOption"
    | "rule.badValue"
    | "rule.forwardRef"
    | "rule.selfRef"
    | "rule.cycle";
  message: string;
  /** Step or field the issue belongs to, for highlighting in the editor. */
  targetId?: string;
  path: (string | number)[];
};
