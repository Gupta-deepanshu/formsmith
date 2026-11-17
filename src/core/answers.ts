import type { AnswerValue, Field } from "./schema/definition";
import { isEmptyAnswer } from "./rules/engine";

/** Human-readable answer text (review step, responses table, CSV). Choice ids become labels. */
export function formatAnswer(field: Field, value: AnswerValue | undefined): string {
  if (isEmptyAnswer(value)) return "";
  switch (field.type) {
    case "singleChoice":
    case "dropdown":
      return field.options.find((o) => o.id === value)?.label ?? String(value);
    case "multipleChoice": {
      const ids = Array.isArray(value) ? value : [String(value)];
      return ids.map((id) => field.options.find((o) => o.id === id)?.label ?? id).join(", ");
    }
    case "yesNo":
      return value === true || value === "true" ? "Yes" : "No";
    case "rating":
      return `${value} / ${field.max}`;
    case "date": {
      const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : null;
      return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d) : String(value);
    }
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

/** Raw value for sorting (numbers stay numbers; choices sort by label). */
export function sortableAnswer(field: Field, value: AnswerValue | undefined): string | number {
  if (isEmptyAnswer(value)) return "";
  if (field.type === "number" || field.type === "rating") {
    const n = Number(value);
    return Number.isFinite(n) ? n : "";
  }
  if (field.type === "date") return String(value);
  return formatAnswer(field, value).toLowerCase();
}
