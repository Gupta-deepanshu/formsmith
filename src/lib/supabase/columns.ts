/**
 * Columns clients may select from `responses`. Column grants hide the resume-token
 * fields, so `select *` fails by design; always select this list instead.
 */
export const RESPONSE_COLUMNS =
  "id, form_id, version_id, respondent_id, status, answers, last_step_id, furthest_step_index, started_at, updated_at, submitted_at" as const;
