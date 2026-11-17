import { describe, expect, it } from "vitest";
import { answerSchema, MESSAGES, validateStep, validateSubmission } from "../validation";
import type { Field } from "../schema/definition";
import { feedbackForm, jobApplicationForm } from "../templates";

const ok = (f: Field, v: unknown) => answerSchema(f).safeParse(v).success;
const out = (f: Field, v: unknown) => answerSchema(f).parse(v);
const msg = (f: Field, v: unknown) => {
  const r = answerSchema(f).safeParse(v);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("answerSchema per type", () => {
  it("required vs optional, with empty treated as missing", () => {
    const req: Field = { id: "a", type: "shortText", label: "A", required: true };
    const opt: Field = { ...req, required: false };
    expect(msg(req, "   ")).toBe(MESSAGES.required);
    expect(msg(req, undefined)).toBe(MESSAGES.required);
    expect(ok(opt, "")).toBe(true);
    expect(out(opt, "")).toBeUndefined();
    expect(out(req, "  hi ")).toBe("hi");
  });

  it("text length and pattern", () => {
    const f: Field = { id: "a", type: "shortText", label: "A", required: true, minLength: 3, maxLength: 5, pattern: { regex: "^[a-z]+$", message: "Lowercase only" } };
    expect(ok(f, "ab")).toBe(false);
    expect(ok(f, "abcdef")).toBe(false);
    expect(msg(f, "ABC")).toBe("Lowercase only");
    expect(ok(f, "abc")).toBe(true);
  });

  it("email, url, phone", () => {
    const email: Field = { id: "e", type: "email", label: "E", required: true };
    expect(ok(email, "a@b.co")).toBe(true);
    expect(msg(email, "nope")).toBe(MESSAGES.email);
    const url: Field = { id: "u", type: "url", label: "U", required: true };
    expect(out(url, "linkedin.com/in/ada")).toBe("https://linkedin.com/in/ada");
    expect(ok(url, "javascript:alert(1)")).toBe(false);
    expect(ok(url, "ftp://example.com")).toBe(false);
    const phone: Field = { id: "p", type: "phone", label: "P", required: true };
    expect(ok(phone, "+44 (20) 7946-0958")).toBe(true);
    expect(ok(phone, "12345")).toBe(false);
    expect(ok(phone, "call me")).toBe(false);
  });

  it("number and rating coerce from input strings", () => {
    const n: Field = { id: "n", type: "number", label: "N", required: true, min: 0, max: 60, integer: true };
    expect(out(n, "12")).toBe(12);
    expect(msg(n, "1.5")).toBe(MESSAGES.integer);
    expect(ok(n, "61")).toBe(false);
    expect(msg(n, "")).toBe(MESSAGES.required);
    expect(msg(n, "abc")).toBe(MESSAGES.number);
    const r: Field = { id: "r", type: "rating", label: "R", required: true, max: 5 };
    expect(ok(r, 5)).toBe(true);
    expect(ok(r, 6)).toBe(false);
    expect(ok(r, 0)).toBe(false);
  });

  it("date bounds", () => {
    const d: Field = { id: "d", type: "date", label: "D", required: true, minDate: "2026-01-01", maxDate: "2026-12-31" };
    expect(ok(d, "2026-05-05")).toBe(true);
    expect(ok(d, "2025-12-31")).toBe(false);
    expect(ok(d, "2026-02-30")).toBe(false);
  });

  it("choices only accept known option ids", () => {
    const s: Field = { id: "s", type: "singleChoice", label: "S", required: true, options: [{ id: "o_a", label: "A" }] };
    expect(ok(s, "o_a")).toBe(true);
    expect(ok(s, "A")).toBe(false);
    const m: Field = { id: "m", type: "multipleChoice", label: "M", required: true, maxSelected: 2, options: [{ id: "o_a", label: "A" }, { id: "o_b", label: "B" }, { id: "o_c", label: "C" }] };
    expect(msg(m, [])).toBe(MESSAGES.required);
    expect(out(m, ["o_a", "o_a"])).toEqual(["o_a"]);
    expect(ok(m, ["o_a", "o_b", "o_c"])).toBe(false);
    expect(ok(m, ["o_x"])).toBe(false);
  });

  it("yes/no accepts booleans and their string forms", () => {
    const y: Field = { id: "y", type: "yesNo", label: "Y", required: true };
    expect(out(y, "false")).toBe(false);
    expect(ok(y, true)).toBe(true);
    expect(msg(y, undefined)).toBe(MESSAGES.required);
  });
});

describe("step and submission validation", () => {
  const job = jobApplicationForm();

  it("validates only the visible fields of a step", () => {
    const r = validateStep(job, "s_about", { f_name: "Ada", f_email: "bad" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.errors)).toEqual(["f_email"]);
    expect(validateStep(job, "s_leadership", { f_role: "o_junior" }).success).toBe(true); // hidden step
  });

  it("requires leadership answers only when that step is visible", () => {
    const base = { f_name: "Ada", f_email: "ada@example.com", f_resume: "ada.dev", f_years: "8" };
    expect(validateSubmission(job, { ...base, f_role: "o_mid" }).success).toBe(true);
    const senior = validateSubmission(job, { ...base, f_role: "o_senior" });
    expect(senior.success).toBe(false);
    if (!senior.success) {
      expect(senior.firstInvalidStepId).toBe("s_leadership");
      expect(Object.keys(senior.errors)).toEqual(["f_lead_conflict", "f_lead_mentor"]);
    }
  });

  it("strips hidden and unknown answers and normalises values", () => {
    const r = validateSubmission(job, {
      f_name: " Ada ",
      f_email: "ada@example.com",
      f_resume: "ada.dev",
      f_role: "o_mid",
      f_years: "8",
      f_lead_conflict: "stale",
      evil: "<script>",
    });
    expect(r).toEqual({
      success: true,
      data: { f_name: "Ada", f_email: "ada@example.com", f_resume: "https://ada.dev", f_role: "o_mid", f_years: 8 },
    });
  });

  it("conditional required fields in the feedback form", () => {
    const fb = feedbackForm();
    expect(validateSubmission(fb, { f_rating: 4, f_contact_ok: false }).success).toBe(true);
    const low = validateSubmission(fb, { f_rating: 1, f_contact_ok: true });
    expect(low.success).toBe(false);
    if (!low.success) expect(Object.keys(low.errors).sort()).toEqual(["f_contact_email", "f_low_reason"]);
  });
});
