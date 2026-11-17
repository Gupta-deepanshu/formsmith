import { SCHEMA_VERSION, type FormDefinition, type FormSettings } from "../schema/definition";

/**
 * Starter templates. Used for: the "start from template" picker, the AI fallback when
 * generation fails, the sandbox editor's sample form, and the seeded demo form.
 * Ids are readable on purpose (they're per-form, so templates don't need random ids).
 */

const settings = (submitLabel = "Submit"): FormSettings => ({
  submitLabel,
  confirmation: { title: "Thanks!", message: "Your response has been recorded." },
});

export const blankForm = (): FormDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  title: "Untitled form",
  steps: [
    {
      id: "s_start",
      title: "Step 1",
      kind: "questions",
      fields: [{ id: "f_name", type: "shortText", label: "Your name", required: true }],
    },
  ],
  settings: settings(),
});

export const jobApplicationForm = (): FormDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  title: "Job application",
  description: "Tell us about yourself. It takes about five minutes.",
  steps: [
    {
      id: "s_about",
      title: "About you",
      kind: "questions",
      fields: [
        { id: "f_name", type: "shortText", label: "Full name", required: true, maxLength: 120 },
        { id: "f_email", type: "email", label: "Email", required: true, placeholder: "you@example.com" },
        { id: "f_phone", type: "phone", label: "Phone", required: false, helpText: "Include your country code." },
      ],
    },
    {
      id: "s_experience",
      title: "Experience",
      kind: "questions",
      fields: [
        { id: "f_resume", type: "url", label: "Resume link", required: true, placeholder: "https://" },
        {
          id: "f_role",
          type: "dropdown",
          label: "Role level",
          required: true,
          options: [
            { id: "o_junior", label: "Junior" },
            { id: "o_mid", label: "Mid-level" },
            { id: "o_senior", label: "Senior" },
            { id: "o_staff", label: "Staff / Principal" },
          ],
        },
        { id: "f_years", type: "number", label: "Years of experience", required: true, min: 0, max: 60, integer: true },
      ],
    },
    {
      id: "s_leadership",
      title: "Leadership",
      description: "Only for Senior roles and above.",
      kind: "questions",
      visibleIf: { any: [{ fieldId: "f_role", op: "in", value: ["o_senior", "o_staff"] }] },
      fields: [
        { id: "f_lead_conflict", type: "longText", label: "Describe a time you resolved a disagreement in your team.", required: true, minLength: 50 },
        { id: "f_lead_mentor", type: "longText", label: "How do you approach mentoring?", required: true, minLength: 50 },
        { id: "f_lead_decision", type: "longText", label: "Tell us about a technical decision you'd make differently today.", required: false },
      ],
    },
    { id: "s_review", title: "Review your answers", kind: "review", fields: [] },
  ],
  settings: { submitLabel: "Send application", confirmation: { title: "Application received", message: "We'll be in touch within a week." } },
});

export const feedbackForm = (): FormDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  title: "Product feedback",
  steps: [
    {
      id: "s_rating",
      title: "Your experience",
      kind: "questions",
      fields: [
        { id: "f_rating", type: "rating", label: "How would you rate the product overall?", required: true, max: 5, lowLabel: "Poor", highLabel: "Excellent" },
        {
          id: "f_used",
          type: "multipleChoice",
          label: "Which features do you use?",
          required: false,
          options: [
            { id: "o_builder", label: "Form builder" },
            { id: "o_ai", label: "AI assistant" },
            { id: "o_analytics", label: "Analytics" },
            { id: "o_export", label: "CSV export" },
          ],
        },
        { id: "f_low_reason", type: "longText", label: "What could we do better?", required: true, visibleIf: { all: [{ fieldId: "f_rating", op: "lte", value: 2 }] } },
      ],
    },
    {
      id: "s_contact",
      title: "Follow-up",
      kind: "questions",
      fields: [
        { id: "f_contact_ok", type: "yesNo", label: "Can we contact you about your feedback?", required: true },
        { id: "f_contact_email", type: "email", label: "Email", required: true, visibleIf: { all: [{ fieldId: "f_contact_ok", op: "equals", value: true }] } },
      ],
    },
  ],
  settings: settings("Send feedback"),
});

export const eventRegistrationForm = (): FormDefinition => ({
  schemaVersion: SCHEMA_VERSION,
  title: "Event registration",
  steps: [
    {
      id: "s_details",
      title: "Your details",
      kind: "questions",
      fields: [
        { id: "f_name", type: "shortText", label: "Name", required: true },
        { id: "f_email", type: "email", label: "Email", required: true },
        { id: "f_date", type: "date", label: "Which day will you attend?", required: true, minDate: "2026-01-01" },
        {
          id: "f_ticket",
          type: "singleChoice",
          label: "Ticket type",
          required: true,
          options: [
            { id: "o_general", label: "General" },
            { id: "o_student", label: "Student" },
            { id: "o_speaker", label: "Speaker" },
          ],
        },
        { id: "f_site", type: "url", label: "Talk or portfolio link", required: false, visibleIf: { all: [{ fieldId: "f_ticket", op: "equals", value: "o_speaker" }] } },
      ],
    },
    { id: "s_review", title: "Check and confirm", kind: "review", fields: [] },
  ],
  settings: settings("Register"),
});

export const TEMPLATES = [
  { key: "blank", name: "Blank form", keywords: [] as string[], build: blankForm },
  { key: "job", name: "Job application", keywords: ["job", "application", "apply", "candidate", "hiring", "role", "resume", "cv", "recruit"], build: jobApplicationForm },
  { key: "feedback", name: "Product feedback", keywords: ["feedback", "survey", "rating", "satisfaction", "nps", "review", "customer"], build: feedbackForm },
  { key: "event", name: "Event registration", keywords: ["event", "registration", "register", "rsvp", "ticket", "conference", "meetup", "attend"], build: eventRegistrationForm },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

/** Pick the template whose keywords best match a description (AI fallback). Blank if nothing matches. */
export function closestTemplate(description: string): (typeof TEMPLATES)[number] {
  const words = new Set(description.toLowerCase().match(/[a-z]+/g) ?? []);
  let best: (typeof TEMPLATES)[number] = TEMPLATES[0];
  let bestScore = 0;
  for (const t of TEMPLATES) {
    const score = t.keywords.filter((k) => words.has(k)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}
