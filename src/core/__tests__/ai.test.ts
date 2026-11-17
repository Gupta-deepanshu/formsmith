import { describe, expect, it } from "vitest";
import { repairForm, resolveFieldType } from "../ai/repair";
import { applyAiEdit } from "../ai/edit";
import { denormalize, normalize } from "../patch/normalized";
import { applyOps } from "../patch/ops";
import { validateForm } from "../schema/validateForm";
import { computeVisibility } from "../rules/engine";
import { jobApplicationForm } from "../templates";

const aiJob = {
  title: "Job application",
  steps: [
    {
      id: "basics",
      title: "Basics",
      kind: "questions",
      questions: [
        { id: "full_name", type: "shortText", label: "Full name", required: true },
        { id: "email", type: "email", label: "Email", required: true },
        {
          id: "seniority",
          type: "dropdown",
          label: "Role level",
          required: true,
          options: ["Junior", "Mid", "Senior", "Lead", "Senior"],
        },
      ],
    },
    {
      id: "leadership",
      title: "Leadership",
      kind: "questions",
      showIf: {
        match: "any",
        rules: [{ questionId: "seniority", operator: "in", values: ["senior", "Lead"] }],
      },
      questions: [
        { id: "q1", type: "textarea", label: "Tell us about leading a team", required: true },
      ],
    },
    { id: "review", title: "Review", kind: "review", questions: [] },
  ],
};

describe("repairForm", () => {
  it("turns flat AI output into a valid form, mapping option labels to ids", () => {
    const r = repairForm(aiJob);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const role = r.form.steps[0]!.fields[2]!;
    expect(role.type).toBe("dropdown");
    if (role.type !== "dropdown") return;
    expect(role.options.map((o) => o.label)).toEqual(["Junior", "Mid", "Senior", "Lead"]); // deduped
    const senior = role.options.find((o) => o.label === "Senior")!.id;
    expect(r.form.steps[1]!.visibleIf).toEqual({
      any: [{ fieldId: role.id, op: "in", value: [senior, role.options[3]!.id] }],
    });
    expect(r.form.steps[1]!.fields[0]!.type).toBe("longText"); // alias
    expect(r.form.steps.at(-1)!.kind).toBe("review");
    expect(computeVisibility(r.form, { [role.id]: senior }).steps.has(r.form.steps[1]!.id)).toBe(
      true,
    );
  });

  it("is deterministic (stable ids for streaming)", () => {
    expect(repairForm(aiJob)).toEqual(repairForm(aiJob));
  });

  it("dedupes ids, fixes types, drops broken rules and reports notes", () => {
    const r = repairForm({
      title: "",
      steps: [
        {
          title: "One",
          questions: [
            { id: "a", type: "radio", label: "Pick", required: true, options: [] },
            { id: "a", type: "hologram", label: "Second", required: false },
            { id: "b", type: "number", label: "Age", required: true, min: 10, max: 5 },
            { type: "email", required: true }, // no label -> skipped
            {
              id: "c",
              type: "shortText",
              label: "Later",
              required: false,
              showIf: { match: "all", rules: [{ questionId: "d", operator: "isAnswered" }] },
            },
            { id: "d", type: "shortText", label: "Forward target", required: false },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fields = r.form.steps[0]!.fields;
    expect(r.form.title).toBe("Untitled form");
    expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length);
    expect(fields[0]!.type).toBe("shortText"); // choice without options
    expect(fields[1]!.type).toBe("shortText"); // unknown type
    expect(fields.find((f) => f.label === "Later")!.visibleIf).toBeUndefined(); // forward ref dropped
    expect(validateForm(r.form).ok).toBe(true);
    expect(r.notes.length).toBeGreaterThan(2);
  });

  it("fails cleanly on garbage and keeps partial output usable", () => {
    expect(repairForm("nope").ok).toBe(false);
    expect(repairForm({ title: "x", steps: [] }).ok).toBe(false);
    const partial = repairForm(
      {
        title: "Job",
        steps: [
          {
            title: "Basics",
            questions: [
              { id: "n", type: "shortText", label: "Name", required: true },
              { id: "e", type: "em" },
            ],
          },
        ],
      },
      { partial: true },
    );
    expect(partial.ok).toBe(true);
    if (partial.ok) expect(partial.form.steps[0]!.fields).toHaveLength(1);
  });

  it("resolves type aliases", () => {
    expect(resolveFieldType("Checkboxes")).toBe("multipleChoice");
    expect(resolveFieldType("yes-no")).toBe("yesNo");
    expect(resolveFieldType("quantum")).toBeNull();
  });
});

describe("applyAiEdit", () => {
  it("'make phone optional and add a LinkedIn field'", () => {
    const nf = normalize(jobApplicationForm());
    const out = applyAiEdit(nf, [
      { op: "updateQuestion", questionId: "f_phone", changes: { required: false } },
      {
        op: "addQuestion",
        stepId: "s_about",
        question: { id: "linkedin", type: "url", label: "LinkedIn profile", required: false },
      },
    ]);
    expect(out.rejected).toEqual([]);
    expect(out.ops.map((o) => o.op)).toEqual(["addField"]); // phone was already optional: no-op dropped
    expect(out.changedFieldIds).toEqual(["f_linkedin"]);
    // The client re-applies the same ops to its own state and gets the same result.
    expect(denormalize(applyOps(nf, out.ops).form)).toEqual(denormalize(out.form));
  });

  it("matches questions by label, keeps option ids on update, and maps rule labels", () => {
    const nf = normalize(jobApplicationForm());
    const out = applyAiEdit(nf, [
      {
        op: "updateQuestion",
        questionId: "Role level",
        changes: { options: ["Junior", "Mid-level", "Senior", "Staff / Principal", "Director"] },
      },
      {
        op: "addQuestion",
        stepId: "s_experience",
        question: {
          id: "reports",
          type: "number",
          label: "Direct reports",
          required: false,
          showIf: {
            match: "all",
            rules: [{ questionId: "f_role", operator: "equals", value: "Director" }],
          },
        },
      },
    ]);
    expect(out.rejected).toEqual([]);
    const role = out.form.fields.f_role!;
    if (role.type !== "dropdown") throw new Error("type");
    expect(role.options[0]!.id).toBe("o_junior");
    const director = role.options[4]!.id;
    expect(out.form.fields.f_reports!.visibleIf).toEqual({
      all: [{ fieldId: "f_role", op: "equals", value: director }],
    });
  });

  it("rejects ops that introduce errors or target missing things, keeps the rest", () => {
    const nf = normalize(jobApplicationForm());
    const out = applyAiEdit(nf, [
      { op: "removeQuestion", questionId: "f_ghost" },
      { op: "moveStep", stepId: "s_review", position: 0 }, // review must be last
      { op: "updateQuestion", questionId: "f_name", changes: { label: "Your full name" } },
    ]);
    expect(out.rejected.map((r) => r.index)).toEqual([0, 1]);
    expect(out.form.fields.f_name!.label).toBe("Your full name");
  });

  it("removing a question referenced by a rule cleans the rule", () => {
    const nf = normalize(jobApplicationForm());
    const out = applyAiEdit(nf, [{ op: "removeQuestion", questionId: "f_role" }]);
    expect(out.rejected).toEqual([]);
    expect(out.form.steps.s_leadership!.visibleIf).toBeUndefined();
  });
});
