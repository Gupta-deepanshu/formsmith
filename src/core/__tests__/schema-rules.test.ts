import { describe, expect, it } from "vitest";
import { validateForm } from "../schema/validateForm";
import { loadForm } from "../schema/migrate";
import { normaliseFieldShape, newField } from "../schema/fieldTypes";
import { createId, toIdLike } from "../schema/ids";
import { FieldSchema, type FormDefinition } from "../schema/definition";
import {
  computeVisibility,
  evaluateClause,
  indexFields,
  pruneHiddenAnswers,
} from "../rules/engine";
import { analyzeRules, findCycles } from "../rules/analyze";
import { TEMPLATES, closestTemplate, feedbackForm, jobApplicationForm } from "../templates";

const clone = <T>(v: T): T => structuredClone(v);

describe("schema", () => {
  it.each(TEMPLATES.map((t) => [t.key, t.build] as const))(
    "template %s is valid with no errors",
    (_key, build) => {
      const r = validateForm(build());
      expect(r.ok).toBe(true);
      expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    },
  );

  it("rejects type-inappropriate options thanks to the discriminated union", () => {
    expect(
      FieldSchema.safeParse({ id: "f_a", type: "email", label: "E", required: true, min: 3 })
        .success,
    ).toBe(true); // unknown keys are stripped...
    const parsed = FieldSchema.parse({
      id: "f_a",
      type: "email",
      label: "E",
      required: true,
      min: 3,
    });
    expect("min" in parsed).toBe(false); // ...not carried through
    expect(
      FieldSchema.safeParse({ id: "f_a", type: "dropdown", label: "D", required: true }).success,
    ).toBe(false);
  });

  it("flags inconsistent validation options", () => {
    const r = FieldSchema.safeParse({
      id: "f_a",
      type: "number",
      label: "N",
      required: false,
      min: 10,
      max: 1,
    });
    expect(r.success).toBe(false);
    const bad = FieldSchema.safeParse({
      id: "f_a",
      type: "shortText",
      label: "T",
      required: false,
      pattern: { regex: "(", message: "x" },
    });
    expect(bad.success).toBe(false);
  });

  it("reports duplicate ids and misplaced review steps", () => {
    const f = jobApplicationForm();
    f.steps[1]!.fields[0]!.id = "f_name";
    f.steps.splice(1, 0, { id: "s_review2", title: "R", kind: "review", fields: [] });
    const r = validateForm(f);
    expect(r.ok).toBe(false);
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain("duplicateId");
    expect(codes).toContain("review.notLast");
    expect(codes).toContain("review.multiple");
  });

  it("schema errors carry the target id for editor highlighting", () => {
    const f = clone(jobApplicationForm()) as unknown as {
      steps: { fields: { label: string }[] }[];
    };
    f.steps[0]!.fields[1]!.label = "";
    const r = validateForm(f);
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.targetId).toBe("f_email");
  });

  it("loadForm accepts current-version documents", () => {
    expect(loadForm(JSON.parse(JSON.stringify(feedbackForm()))).ok).toBe(true);
    expect(loadForm({ nope: true }).ok).toBe(false);
  });

  it("normaliseFieldShape converts between types", () => {
    const dd = newField("dropdown", "Pick");
    const asText = normaliseFieldShape(dd as unknown as Record<string, unknown>, "shortText");
    expect(asText.options).toBeUndefined();
    expect(FieldSchema.safeParse(asText).success).toBe(true);
    const back = normaliseFieldShape(asText, "singleChoice");
    expect(Array.isArray(back.options)).toBe(true);
    expect(FieldSchema.safeParse(back).success).toBe(true);
  });

  it("ids", () => {
    expect(createId("f")).toMatch(/^f_[a-z0-9]{8}$/);
    expect(toIdLike("Years of experience!", "f")).toBe("f_Years_of_experience");
    expect(toIdLike("123", "f")).toBeNull();
  });
});

describe("rule engine", () => {
  const job = jobApplicationForm();
  const fields = indexFields(job);

  it("shows the leadership step only for senior roles", () => {
    expect(computeVisibility(job, { f_role: "o_junior" }).steps.has("s_leadership")).toBe(false);
    expect(computeVisibility(job, { f_role: "o_senior" }).steps.has("s_leadership")).toBe(true);
    expect(computeVisibility(job, {}).stepOrder).toEqual(["s_about", "s_experience", "s_review"]);
  });

  it("drops answers to hidden fields", () => {
    const answers = { f_name: "Ada", f_role: "o_mid", f_lead_conflict: "stale answer" };
    expect(pruneHiddenAnswers(job, answers)).toEqual({ f_name: "Ada", f_role: "o_mid" });
  });

  it("cascades: hidden fields read as empty for later rules", () => {
    const f: FormDefinition = {
      ...feedbackForm(),
      steps: [
        {
          id: "s1",
          title: "S",
          kind: "questions",
          fields: [
            { id: "a", type: "yesNo", label: "A", required: false },
            {
              id: "b",
              type: "shortText",
              label: "B",
              required: false,
              visibleIf: { all: [{ fieldId: "a", op: "equals", value: true }] },
            },
            {
              id: "c",
              type: "shortText",
              label: "C",
              required: false,
              visibleIf: { all: [{ fieldId: "b", op: "isAnswered" }] },
            },
          ],
        },
      ],
    };
    // b still holds a stale answer, but a=false hides b, so c must hide too.
    const v = computeVisibility(f, { a: false, b: "stale" });
    expect([...v.fields]).toEqual(["a"]);
    expect([...computeVisibility(f, { a: true, b: "x" }).fields]).toEqual(["a", "b", "c"]);
  });

  it("operator semantics", () => {
    const fb = feedbackForm();
    const idx = indexFields(fb);
    expect(evaluateClause({ fieldId: "f_rating", op: "lte", value: 2 }, { f_rating: 2 }, idx)).toBe(
      true,
    );
    expect(evaluateClause({ fieldId: "f_rating", op: "gt", value: 2 }, { f_rating: 2 }, idx)).toBe(
      false,
    );
    expect(
      evaluateClause(
        { fieldId: "f_used", op: "contains", value: "o_ai" },
        { f_used: ["o_ai"] },
        idx,
      ),
    ).toBe(true);
    expect(
      evaluateClause(
        { fieldId: "f_used", op: "notIn", value: ["o_ai", "o_export"] },
        { f_used: ["o_builder"] },
        idx,
      ),
    ).toBe(true);
    expect(
      evaluateClause(
        { fieldId: "f_name", op: "equals", value: "ada" },
        { f_name: "  Ada " },
        fields,
      ),
    ).toBe(true);
    expect(
      evaluateClause({ fieldId: "f_name", op: "contains", value: "DA" }, { f_name: "Ada" }, fields),
    ).toBe(true);
    // Unanswered: comparisons are false, even negative ones.
    expect(
      evaluateClause({ fieldId: "f_role", op: "notEquals", value: "o_junior" }, {}, fields),
    ).toBe(false);
    expect(evaluateClause({ fieldId: "f_role", op: "isEmpty" }, { f_role: "" }, fields)).toBe(true);
    // Unknown field: false rather than throwing.
    expect(
      evaluateClause({ fieldId: "f_nope", op: "equals", value: "x" }, { f_nope: "x" }, fields),
    ).toBe(false);
  });

  it("dates compare chronologically", () => {
    const f = eventFormWithDateRule();
    expect(computeVisibility(f, { f_date: "2026-06-02" }).fields.has("f_late")).toBe(true);
    expect(computeVisibility(f, { f_date: "2026-05-30" }).fields.has("f_late")).toBe(false);
  });
});

function eventFormWithDateRule(): FormDefinition {
  return {
    schemaVersion: 1,
    title: "T",
    settings: { submitLabel: "Go", confirmation: { title: "t", message: "" } },
    steps: [
      {
        id: "s1",
        title: "S",
        kind: "questions",
        fields: [
          { id: "f_date", type: "date", label: "Date", required: false },
          {
            id: "f_late",
            type: "shortText",
            label: "Late",
            required: false,
            visibleIf: { all: [{ fieldId: "f_date", op: "gt", value: "2026-06-01" }] },
          },
        ],
      },
    ],
  };
}

describe("rule analysis", () => {
  it("accepts all templates", () => {
    for (const t of TEMPLATES) expect(analyzeRules(t.build())).toEqual([]);
  });

  it("rejects forward references created by reordering", () => {
    const f = feedbackForm();
    const step = f.steps[0]!;
    // Move the dependent field above the rating it depends on.
    const low = step.fields.splice(2, 1)[0]!;
    step.fields.unshift(low);
    expect(analyzeRules(f).map((i) => i.code)).toContain("rule.forwardRef");
  });

  it("rejects step rules that depend on their own step", () => {
    const f = jobApplicationForm();
    f.steps[2]!.visibleIf = { all: [{ fieldId: "f_lead_mentor", op: "isAnswered" }] };
    expect(analyzeRules(f).map((i) => i.code)).toContain("rule.forwardRef");
  });

  it("names circular rules", () => {
    const f = eventFormWithDateRule();
    f.steps[0]!.fields[0]!.visibleIf = { all: [{ fieldId: "f_late", op: "isAnswered" }] };
    const issues = analyzeRules(f);
    const cycle = issues.find((i) => i.code === "rule.cycle");
    expect(cycle?.message).toContain('"Date"');
    expect(cycle?.message).toContain('"Late"');
  });

  it("detects self references, bad operators, missing values and unknown options", () => {
    const f = jobApplicationForm();
    const role = f.steps[1]!.fields[1]!;
    role.visibleIf = { all: [{ fieldId: "f_role", op: "isAnswered" }] };
    f.steps[1]!.fields[2]!.visibleIf = {
      all: [
        { fieldId: "f_name", op: "gt", value: 3 },
        { fieldId: "f_role", op: "equals" },
        { fieldId: "f_role", op: "in", value: ["o_ghost"] },
      ],
    };
    const codes = analyzeRules(f).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "rule.selfRef",
        "rule.badOperator",
        "rule.missingValue",
        "rule.unknownOption",
      ]),
    );
  });

  it("findCycles returns each cycle once", () => {
    const g = new Map([
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", ["a"]],
      ["d", ["d"]],
    ]);
    const cycles = findCycles(g);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toEqual(["a", "b", "c", "a"]);
  });
});

describe("templates", () => {
  it("closestTemplate matches by keywords", () => {
    expect(closestTemplate("A job application with resume link").key).toBe("job");
    expect(closestTemplate("RSVP for our meetup").key).toBe("event");
    expect(closestTemplate("zzz").key).toBe("blank");
  });
});
