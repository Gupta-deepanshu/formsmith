"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AreaChart } from "@/components/charts/AreaChart";
import { HBarChart } from "@/components/charts/HBarChart";
import { StatTile, type StatTrend } from "@/components/charts/StatTile";
import { buttonClasses, EmptyState, Icon, Select, Tabs } from "@/components/ui";
import {
  choiceSummaries,
  completionRate,
  dailyCounts,
  funnel,
  mergedFields,
  periodChange,
  type FormDefinition,
  type ResponseRecord,
} from "@/core";
import { plural } from "@/lib/format";
import { ResponsesTable } from "./ResponsesTable";

export type VersionInfo = {
  id: string;
  version: number;
  publishedAt: string;
  form: FormDefinition;
};

/** Analytics over loaded rows; all computation is pure core functions, rendered with hand-built charts. */
export function ResponsesDashboard({
  title,
  formId,
  slug,
  isPublished,
  versions,
  responses,
  truncated,
}: {
  title: string;
  formId: string;
  slug: string;
  isPublished: boolean;
  versions: VersionInfo[];
  responses: ResponseRecord[];
  truncated: boolean;
}) {
  const [versionId, setVersionId] = useState<string>("all");
  const [tab, setTab] = useState<"summary" | "table">("summary");

  const byId = useMemo(() => new Map(versions.map((v) => [v.id, v])), [versions]);
  // Stable callbacks so the memoised analytics below don't recompute on every render.
  const formFor = useCallback((vid: string) => byId.get(vid)?.form, [byId]);
  const versionLabel = useCallback((vid: string) => `v${byId.get(vid)?.version ?? "?"}`, [byId]);
  const scoped = useMemo(
    () => (versionId === "all" ? responses : responses.filter((r) => r.versionId === versionId)),
    [responses, versionId],
  );
  const base = versionId === "all" ? versions[0]?.form : byId.get(versionId)?.form;
  const fields = useMemo(
    () =>
      versionId === "all"
        ? mergedFields(versions.map((v) => v.form))
        : (base?.steps.flatMap((s) => s.fields) ?? []),
    [versionId, versions, base],
  );

  const header = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href={`/forms/${formId}/edit`} className="text-sm text-fg-muted hover:text-fg">
          ← Back to editor
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-fg-muted">Responses</p>
      </div>
      {versions.length > 1 ? (
        <div className="w-48">
          <Select
            aria-label="Version"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            options={[
              { value: "all", label: "All versions" },
              ...versions.map((v) => ({ value: v.id, label: `Version ${v.version}` })),
            ]}
          />
        </div>
      ) : null}
    </div>
  );

  if (!base) {
    return (
      <>
        {header}
        <EmptyState
          icon={<Icon name="form" className="size-8" />}
          title="Not published yet"
          description="Publish the form to get a link and start collecting responses."
          action={
            <Link href={`/forms/${formId}/edit`} className={buttonClasses({ variant: "primary" })}>
              Open editor
            </Link>
          }
        />
      </>
    );
  }

  if (responses.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<Icon name="form" className="size-8" />}
          title="No responses yet"
          description={
            isPublished
              ? "Share the link to start collecting responses."
              : "The form is unpublished."
          }
          action={
            isPublished ? (
              <a
                href={`/f/${slug}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "primary" })}
              >
                Open the form
              </a>
            ) : null
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {truncated ? (
        <p className="mb-4 rounded-control bg-warning-soft px-3 py-2 text-sm">
          Showing the latest 5,000 responses.
        </p>
      ) : null}
      <Tabs
        label="Responses views"
        value={tab}
        onChange={setTab}
        items={[
          {
            key: "summary",
            label: "Summary",
            panel: <Summary base={base} fields={fields} responses={scoped} formFor={formFor} />,
          },
          {
            key: "table",
            label: `Responses (${scoped.length.toLocaleString("en")})`,
            panel: (
              <ResponsesTable
                fields={fields}
                responses={scoped}
                formFor={formFor}
                versionLabel={versionLabel}
                fileName={slug}
              />
            ),
          },
        ]}
      />
    </>
  );
}

/*
 * "Today" for the trend charts. Read only in the browser (server snapshot = null): the
 * server runs in UTC, the reader in their own zone, so computing day buckets on the server
 * would mismatch on hydration and put late-evening responses on the wrong day.
 * One Date per page load is a stable snapshot.
 */
let pageNow: Date | null = null;
const getNow = () => (pageNow ??= new Date());
const noSubscribe = () => () => {};

const TREND_DAYS = 7;
const CHART_DAYS = 30;

export function Summary({
  base,
  fields,
  responses,
  formFor,
  trends = true,
}: {
  base: FormDefinition;
  fields: FormDefinition["steps"][number]["fields"];
  responses: ResponseRecord[];
  formFor: (versionId: string) => FormDefinition | undefined;
  /** Week-over-week badges, sparklines and the per-day chart. Off for the demo (no timestamps). */
  trends?: boolean;
}) {
  const completion = useMemo(() => completionRate(responses), [responses]);
  const f = useMemo(() => funnel(base, responses, formFor), [base, responses, formFor]);
  const choices = useMemo(() => choiceSummaries(fields, responses), [fields, responses]);
  const now = useSyncExternalStore(noSubscribe, getNow, () => null);

  const series = useMemo(() => {
    if (!trends || !now) return null;
    const started = responses.map((r) => r.startedAt);
    const submitted = responses.map((r) => r.submittedAt);
    const trendOf = (stamps: (string | null)[]): StatTrend => {
      const daily = dailyCounts(stamps, TREND_DAYS * 2, now);
      return {
        daily,
        period: TREND_DAYS,
        change: periodChange(daily, TREND_DAYS),
        periodLabel: `Last ${TREND_DAYS} days vs the ${TREND_DAYS} before`,
      };
    };
    return {
      started: trendOf(started),
      submitted: trendOf(submitted),
      perDay: dailyCounts(submitted, CHART_DAYS, now),
    };
  }, [trends, now, responses]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Started"
          value={completion.started}
          detail="Answered at least one question"
          trend={series?.started}
        />
        <StatTile label="Submitted" value={completion.submitted} trend={series?.submitted} />
        <StatTile
          label="Completion rate"
          value={completion.rate}
          format="percent"
          ratio={completion.rate}
          detail={`${plural(completion.submitted, "submission")} of ${plural(completion.started, "start")}`}
        />
      </div>

      {series ? (
        <section className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
          <AreaChart
            title={`Submissions per day, last ${CHART_DAYS} days`}
            description="Counted on the day each response was submitted, in your time zone."
            data={series.perDay}
            valueLabel="submissions"
          />
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        <HBarChart
          title="Drop-off by step"
          description="How many respondents reached each step. Conditional steps only count people they were shown to."
          total={f.started}
          valueLabel="Respondents"
          rows={[
            ...f.steps.map((s, i) => ({
              key: s.stepId,
              label: `${i + 1}. ${s.title}`,
              value: s.reached,
              note: s.conditional ? "conditional" : undefined,
            })),
            { key: "__submitted", label: "Submitted", value: f.submitted },
          ]}
        />
      </section>

      {choices.length ? (
        <section aria-labelledby="choice-heading" className="flex flex-col gap-3">
          <h2 id="choice-heading" className="text-sm font-semibold text-fg-muted">
            Answers to choice questions (submitted responses)
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {choices.map((c) => (
              <div
                key={c.fieldId}
                className="rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <HBarChart
                  title={c.label}
                  description={`${plural(c.answered, "answer")}${c.type === "multipleChoice" ? " · respondents could pick several" : ""}`}
                  total={c.answered}
                  valueLabel="Answers"
                  rows={c.counts.map((x) => ({ key: x.key, label: x.label, value: x.count }))}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
