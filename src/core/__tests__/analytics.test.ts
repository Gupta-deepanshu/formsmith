import { describe, expect, it } from "vitest";
import {
  choiceSummaries,
  completionRate,
  csvCell,
  dailyCounts,
  funnel,
  mergedFields,
  periodChange,
  toCsv,
  type ResponseRecord,
} from "../analytics";
import { formatAnswer } from "../answers";
import { feedbackForm, jobApplicationForm } from "../templates";

const job = jobApplicationForm();
const r = (over: Partial<ResponseRecord>): ResponseRecord => ({
  id: "r",
  versionId: "v1",
  status: "draft",
  answers: {},
  furthestStepIndex: 0,
  startedAt: "2026-11-01T10:00:00Z",
  submittedAt: null,
  ...over,
});

describe("funnel", () => {
  const responses = [
    r({ id: "a", furthestStepIndex: 0 }),
    r({ id: "b", furthestStepIndex: 1, answers: { f_role: "o_junior" } }),
    r({ id: "c", status: "submitted", submittedAt: "x", answers: { f_role: "o_mid" } }),
    r({ id: "d", status: "submitted", submittedAt: "x", answers: { f_role: "o_senior" } }),
  ];
  const f = funnel(job, responses, () => job);

  it("counts each respondent along their own visible path", () => {
    const by = Object.fromEntries(f.steps.map((s) => [s.stepId, s.reached]));
    expect(by).toEqual({ s_about: 4, s_experience: 3, s_leadership: 1, s_review: 2 });
    expect(f.steps.find((s) => s.stepId === "s_leadership")!.conditional).toBe(true);
    expect(f.started).toBe(4);
    expect(f.submitted).toBe(2);
  });

  it("completion rate", () => {
    expect(completionRate(responses)).toEqual({ started: 4, submitted: 2, rate: 0.5 });
    expect(completionRate([]).rate).toBe(0);
  });
});

describe("choice summaries", () => {
  it("counts options for submitted responses only", () => {
    const fb = feedbackForm();
    const fields = fb.steps.flatMap((s) => s.fields);
    const rows = [
      r({
        status: "submitted",
        answers: { f_rating: 5, f_used: ["o_ai", "o_builder"], f_contact_ok: true },
      }),
      r({ status: "submitted", answers: { f_rating: 4, f_used: ["o_ai"], f_contact_ok: false } }),
      r({ status: "draft", answers: { f_rating: 1 } }),
    ];
    const s = choiceSummaries(fields, rows);
    expect(s.map((x) => x.fieldId)).toEqual(["f_rating", "f_used", "f_contact_ok"]);
    expect(s[0]!.counts.map((c) => c.count)).toEqual([0, 0, 0, 1, 1]);
    expect(s[1]!.counts.find((c) => c.key === "o_ai")!.count).toBe(2);
    expect(s[1]!.answered).toBe(2);
    expect(s[2]!.counts).toEqual([
      { key: "true", label: "Yes", count: 1 },
      { key: "false", label: "No", count: 1 },
    ]);
  });
});

describe("merged fields across versions", () => {
  it("newest order first, then fields only in older versions", () => {
    const v2 = jobApplicationForm();
    v2.steps[0]!.fields = v2.steps[0]!.fields.filter((f) => f.id !== "f_phone");
    v2.steps[0]!.fields[0]!.label = "Name (v2)";
    const ids = mergedFields([v2, job]).map((f) => f.id);
    expect(ids[0]).toBe("f_name");
    expect(ids.at(-1)).toBe("f_phone");
    expect(mergedFields([v2, job])[0]!.label).toBe("Name (v2)");
  });
});

describe("csv", () => {
  it("quotes, escapes and blocks formula injection", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-5")).toBe("'-5");
  });

  it("builds a sheet with labels for choices", () => {
    const fields = job.steps.flatMap((s) => s.fields).slice(0, 5);
    const csv = toCsv(
      fields,
      [
        r({
          id: "x1",
          status: "submitted",
          submittedAt: "2026-11-02",
          answers: { f_name: "Ada, L.", f_role: "o_senior" },
        }),
      ],
      () => "v1",
    );
    const [head, row] = csv.slice(1).split("\r\n");
    expect(head).toBe(
      "Response ID,Status,Version,Started,Submitted,Full name,Email,Phone,Resume link,Role level",
    );
    expect(row).toBe('x1,Submitted,v1,2026-11-01T10:00:00Z,2026-11-02,"Ada, L.",,,,Senior');
  });

  it("formatAnswer", () => {
    const fb = feedbackForm().steps.flatMap((s) => s.fields);
    expect(formatAnswer(fb[0]!, 4)).toBe("4 / 5");
    expect(formatAnswer(fb[1]!, ["o_ai", "o_export"])).toBe("AI assistant, CSV export");
    expect(formatAnswer(fb[3]!, false)).toBe("No");
  });
});

describe("dailyCounts", () => {
  // Built from local dates, so the test passes in any time zone.
  const now = new Date(2026, 10, 18, 15, 0);
  const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString();

  it("zero-fills the range, oldest first, ending today", () => {
    const out = dailyCounts([], 3, now);
    expect(out).toEqual([
      { day: "2026-11-16", count: 0 },
      { day: "2026-11-17", count: 0 },
      { day: "2026-11-18", count: 0 },
    ]);
  });

  it("buckets by local day and ignores empty, invalid and out-of-range timestamps", () => {
    const out = dailyCounts(
      [at(18, 0), at(18, 23), at(17), null, undefined, "", "not a date", at(1)],
      3,
      now,
    );
    expect(out.map((d) => d.count)).toEqual([0, 1, 2]);
  });

  it("crosses month boundaries", () => {
    const out = dailyCounts([new Date(2026, 9, 31, 12).toISOString()], 20, now);
    expect(out[0]!.day).toBe("2026-10-30");
    expect(out.find((d) => d.day === "2026-10-31")!.count).toBe(1);
  });
});

describe("periodChange", () => {
  const days = (counts: number[]) => counts.map((count, i) => ({ day: String(i), count }));

  it("compares the last period with the one before", () => {
    expect(periodChange(days([1, 1, 2, 2]), 2)).toEqual({ current: 4, previous: 2, change: 1 });
    expect(periodChange(days([4, 0, 1, 1]), 2)).toEqual({
      current: 2,
      previous: 4,
      change: -0.5,
    });
  });

  it("has no relative change when the previous period was empty", () => {
    expect(periodChange(days([0, 0, 3, 0]), 2)).toEqual({ current: 3, previous: 0, change: null });
  });
});
