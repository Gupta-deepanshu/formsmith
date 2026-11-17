import { describe, expect, it } from "vitest";
import { denormalize, normalize, type NormalizedForm } from "../patch/normalized";
import { applyOp, applyOps, PatchError, PatchOpSchema, type PatchOp } from "../patch/ops";
import { duplicateFieldOps, nudgeFieldOps, removeFieldOps, removeStepOps } from "../patch/compound";
import {
  afterRedo,
  afterUndo,
  coalesceKeyFor,
  EMPTY_HISTORY,
  peekRedo,
  peekUndo,
  record,
  type History,
} from "../patch/history";
import { validateForm } from "../schema/validateForm";
import { feedbackForm, jobApplicationForm } from "../templates";

const job = () => normalize(jobApplicationForm());
const roundTrip = (nf: NormalizedForm, ops: PatchOp[]) => {
  const fwd = applyOps(nf, ops);
  const back = applyOps(fwd.form, fwd.inverse);
  return { fwd, back };
};

describe("normalize / denormalize", () => {
  it("round-trips exactly", () => {
    expect(denormalize(job())).toEqual(jobApplicationForm());
  });
});

describe("applyOp + inverse", () => {
  const cases: [string, PatchOp[]][] = [
    [
      "addStep",
      [
        {
          op: "addStep",
          index: 1,
          step: {
            id: "s_new",
            title: "New",
            kind: "questions",
            fields: [{ id: "f_new", type: "yesNo", label: "Q", required: false }],
          },
        },
      ],
    ],
    ["removeStep", [{ op: "removeStep", stepId: "s_experience" }]],
    [
      "updateStep",
      [
        {
          op: "updateStep",
          stepId: "s_leadership",
          changes: { title: "Lead", visibleIf: undefined, description: "d" },
        },
      ],
    ],
    ["moveStep", [{ op: "moveStep", stepId: "s_about", toIndex: 2 }]],
    [
      "addField",
      [
        {
          op: "addField",
          stepId: "s_about",
          index: 0,
          field: { id: "f_x", type: "url", label: "LinkedIn", required: false },
        },
      ],
    ],
    ["removeField", [{ op: "removeField", fieldId: "f_phone" }]],
    [
      "updateField",
      [
        {
          op: "updateField",
          fieldId: "f_phone",
          changes: { required: true, helpText: undefined, placeholder: "+44" },
        },
      ],
    ],
    [
      "updateField type change",
      [{ op: "updateField", fieldId: "f_role", changes: { type: "shortText" } }],
    ],
    [
      "moveField across steps",
      [{ op: "moveField", fieldId: "f_email", toStepId: "s_experience", toIndex: 1 }],
    ],
    [
      "moveField within step",
      [{ op: "moveField", fieldId: "f_name", toStepId: "s_about", toIndex: 2 }],
    ],
    ["updateForm", [{ op: "updateForm", changes: { title: "Apply", description: undefined } }]],
    [
      "sequence",
      [
        { op: "updateField", fieldId: "f_phone", changes: { required: true } },
        { op: "moveField", fieldId: "f_phone", toStepId: "s_experience", toIndex: 0 },
        { op: "removeField", fieldId: "f_name" },
      ],
    ],
  ];

  it.each(cases)("%s: inverse restores the original", (_name, ops) => {
    const nf = job();
    const { fwd, back } = roundTrip(nf, ops);
    expect(denormalize(fwd.form)).not.toEqual(denormalize(nf));
    expect(denormalize(back.form)).toEqual(denormalize(nf));
  });

  it("never mutates its input", () => {
    const nf = job();
    const snapshot = structuredClone(nf);
    applyOps(
      nf,
      cases
        .flatMap(([, ops]) => ops)
        .filter((o) => o.op !== "removeStep" && o.op !== "removeField"),
    );
    expect(nf).toEqual(snapshot);
  });

  it("keeps untouched objects by reference (structural sharing)", () => {
    const nf = job();
    const { form } = applyOp(nf, {
      op: "updateField",
      fieldId: "f_phone",
      changes: { label: "Mobile" },
    });
    expect(form.fields.f_name).toBe(nf.fields.f_name);
    expect(form.steps).toBe(nf.steps);
    expect(form.fields.f_phone).not.toBe(nf.fields.f_phone);
  });

  it("type change drops incompatible keys and undo brings them back", () => {
    const nf = job();
    const { form, inverse } = applyOp(nf, {
      op: "updateField",
      fieldId: "f_role",
      changes: { type: "shortText" },
    });
    expect("options" in form.fields.f_role!).toBe(false);
    expect(applyOps(form, inverse).form.fields.f_role).toEqual(nf.fields.f_role);
  });

  it("throws PatchError for missing targets and id collisions, and applyOps is atomic", () => {
    const nf = job();
    expect(() => applyOp(nf, { op: "removeField", fieldId: "f_nope" })).toThrow(PatchError);
    expect(() =>
      applyOp(nf, {
        op: "addField",
        stepId: "s_about",
        index: 0,
        field: { id: "f_name", type: "email", label: "x", required: false },
      }),
    ).toThrow(PatchError);
    expect(() =>
      applyOp(nf, { op: "updateField", fieldId: "f_name", changes: { id: "f_other" } as never }),
    ).toThrow(PatchError);
    expect(() =>
      applyOps(nf, [
        { op: "removeField", fieldId: "f_name" },
        { op: "removeField", fieldId: "f_nope" },
      ]),
    ).toThrow(PatchError);
    expect(nf.fields.f_name).toBeDefined();
  });

  it("PatchOpSchema validates external ops", () => {
    expect(
      PatchOpSchema.safeParse({ op: "updateField", fieldId: "f_a", changes: { required: true } })
        .success,
    ).toBe(true);
    expect(
      PatchOpSchema.safeParse({ op: "updateField", fieldId: "f_a", changes: { id: "x" } }).success,
    ).toBe(false);
    expect(
      PatchOpSchema.safeParse({ op: "updateField", fieldId: "f_a", changes: { type: "hologram" } })
        .success,
    ).toBe(false);
    expect(PatchOpSchema.safeParse({ op: "explode" }).success).toBe(false);
  });
});

describe("compound edits", () => {
  it("removing a field also removes rules that reference it, and undo restores both", () => {
    const nf = job();
    const ops = removeFieldOps(nf, "f_role");
    const { fwd, back } = roundTrip(nf, ops);
    expect(fwd.form.steps.s_leadership!.visibleIf).toBeUndefined();
    expect(validateForm(denormalize(fwd.form)).ok).toBe(true);
    expect(denormalize(back.form)).toEqual(denormalize(nf));
  });

  it("removing a step cleans references to all its fields", () => {
    const nf = normalize(feedbackForm());
    const { fwd } = roundTrip(nf, removeStepOps(nf, "s_rating"));
    expect(validateForm(denormalize(fwd.form)).ok).toBe(true);
  });

  it("duplicate gets fresh ids for the field and its options", () => {
    const nf = job();
    const d = duplicateFieldOps(nf, "f_role")!;
    const { form } = applyOps(nf, d.ops);
    const copy = form.fields[d.newId]!;
    expect(copy.label).toBe("Role level (copy)");
    expect(form.steps.s_experience!.fieldIds.indexOf(d.newId)).toBe(2);
    expect(validateForm(denormalize(form)).ok).toBe(true);
  });

  it("nudge moves within a step and across step edges, skipping review", () => {
    const nf = job();
    expect(nudgeFieldOps(nf, "f_email", -1)).toEqual([
      { op: "moveField", fieldId: "f_email", toStepId: "s_about", toIndex: 0 },
    ]);
    expect(nudgeFieldOps(nf, "f_name", -1)).toEqual([]);
    expect(nudgeFieldOps(nf, "f_phone", 1)).toEqual([
      { op: "moveField", fieldId: "f_phone", toStepId: "s_experience", toIndex: 0 },
    ]);
    expect(nudgeFieldOps(nf, "f_lead_decision", 1)).toEqual([]);
  });
});

describe("history", () => {
  const entry = (label: string, at: number, ops: PatchOp[] = [], key?: string) => ({
    ops,
    inverse: [],
    source: "manual" as const,
    label,
    at,
    coalesceKey: key,
  });

  it("records, undoes and redoes; new edits clear redo", () => {
    let h: History = EMPTY_HISTORY;
    h = record(h, entry("a", 0));
    h = record(h, entry("b", 1000));
    expect(peekUndo(h)?.label).toBe("b");
    h = afterUndo(h);
    expect(peekRedo(h)?.label).toBe("b");
    h = afterRedo(h);
    expect(h.past.map((e) => e.label)).toEqual(["a", "b"]);
    h = afterUndo(h);
    h = record(h, entry("c", 2000));
    expect(h.future).toEqual([]);
  });

  it("coalesces rapid edits with the same key", () => {
    const op = (label: string): PatchOp => ({
      op: "updateField",
      fieldId: "f_a",
      changes: { label },
    });
    const key = coalesceKeyFor([op("x")]);
    let h = record(EMPTY_HISTORY, entry("type", 0, [op("A")], key));
    h = record(h, entry("type", 300, [op("Ab")], key));
    h = record(h, entry("type", 2000, [op("Abc")], key));
    expect(h.past).toHaveLength(2);
    expect(h.past[0]!.ops).toHaveLength(2);
  });

  it("typing then undo restores the original label in one step", () => {
    const nf = job();
    let form = nf;
    let h: History = EMPTY_HISTORY;
    ["F", "Fu", "Ful"].forEach((label, i) => {
      const ops: PatchOp[] = [{ op: "updateField", fieldId: "f_name", changes: { label } }];
      const r = applyOps(form, ops);
      form = r.form;
      h = record(h, {
        ops,
        inverse: r.inverse,
        source: "manual",
        label: "Edit label",
        at: i * 100,
        coalesceKey: coalesceKeyFor(ops),
      });
    });
    expect(h.past).toHaveLength(1);
    form = applyOps(form, peekUndo(h)!.inverse).form;
    expect(form.fields.f_name!.label).toBe("Full name");
  });
});
