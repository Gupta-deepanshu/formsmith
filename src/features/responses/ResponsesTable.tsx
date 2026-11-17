"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { Badge, Button, Dialog, Icon, Input, Select } from "@/components/ui";
import { formatAnswer, sortableAnswer, toCsv, type Field, type FormDefinition, type ResponseRecord } from "@/core";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Responses table: TanStack Table v9 for headless sorting/filtering logic, our own <table>
 * markup. Rows virtualise (TanStack Virtual, spacer-row technique, so real table semantics
 * are kept) once there are more than VIRTUALIZE_AT rows.
 */

// Stable, module-level feature registry (v9 requires stable inputs).
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});
const helper = createColumnHelper<typeof features, ResponseRecord>();

const VIRTUALIZE_AT = 200;
const ROW_HEIGHT = 44;

type StatusFilter = "all" | "submitted" | "draft";

export function ResponsesTable({ fields, responses, formFor, versionLabel, fileName }: { fields: Field[]; responses: ResponseRecord[]; formFor: (versionId: string) => FormDefinition | undefined; versionLabel: (versionId: string) => string; fileName: string }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [detail, setDetail] = useState<ResponseRecord | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);

  const data = useMemo(() => (status === "all" ? responses : responses.filter((r) => r.status === status)), [responses, status]);
  const shownFields = fields.slice(0, visibleCount);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor((r) => r.submittedAt ?? r.startedAt, { id: "updated", header: "Date", cell: (c) => formatDateTime(c.getValue()), sortFn: "alphanumeric", enableGlobalFilter: false }),
        helper.accessor((r) => (r.status === "submitted" ? "Submitted" : "In progress"), { id: "status", header: "Status", enableGlobalFilter: false }),
        ...shownFields.map((f) =>
          helper.accessor((r) => formatAnswer(f, r.answers[f.id]), {
            id: f.id,
            header: f.label,
            // Sort by the underlying value (numbers numerically), not the display string.
            sortFn: (a, b) => {
              const x = sortableAnswer(f, a.original.answers[f.id]);
              const y = sortableAnswer(f, b.original.answers[f.id]);
              return x === y ? 0 : x === "" ? 1 : y === "" ? -1 : x < y ? -1 : 1;
            },
          }),
        ),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields, visibleCount],
  );

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
  });
  const rows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = rows.length > VIRTUALIZE_AT;
  // eslint-disable-next-line react-hooks/incompatible-library -- React Compiler is not enabled; useVirtualizer is the documented API
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 10, getItemKey: (i) => rows[i]!.id, enabled: virtual });
  const items = virtual ? virtualizer.getVirtualItems() : null;
  const padTop = items?.[0]?.start ?? 0;
  const padBottom = items ? virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0) : 0;
  const rendered = items ? items.map((i) => rows[i.index]!) : rows;

  const exportCsv = () => {
    const csv = toCsv(fields, rows.map((r) => r.original), versionLabel);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}-responses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input type="search" aria-label="Search responses" placeholder="Search answers…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
        </div>
        <div className="w-40">
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "submitted", label: "Submitted" },
              { value: "draft", label: "In progress" },
            ]}
          />
        </div>
        <Button onClick={exportCsv} leadingIcon={<Icon name="download" />}>
          Export CSV
        </Button>
      </div>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {rows.length.toLocaleString("en")} of {responses.length.toLocaleString("en")} responses
        {fields.length > visibleCount ? (
          <>
            {" · "}
            <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => setVisibleCount(fields.length)}>
              Show all {fields.length} questions
            </button>
          </>
        ) : null}
      </p>

      <div ref={scrollRef} className="max-h-[70dvh] overflow-auto rounded-card border border-line bg-surface shadow-card" tabIndex={0} aria-label="Responses table, scrollable">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-subtle">
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"} className="border-b border-line px-3 py-2 font-medium whitespace-nowrap">
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="inline-flex max-w-56 items-center gap-1 truncate rounded-control text-left hover:text-accent">
                        <span className="truncate">
                          <table.FlexRender header={h} />
                        </span>
                        <Icon name={sorted === "asc" ? "chevronUp" : sorted === "desc" ? "chevronDown" : "grip"} className={cn("size-3.5", !sorted && "opacity-40")} />
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="border-b border-line px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: padTop }} />
              </tr>
            ) : null}
            {rendered.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-subtle" style={virtual ? { height: ROW_HEIGHT } : undefined}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="max-w-64 truncate px-3 py-2" title={typeof cell.getValue() === "string" ? (cell.getValue() as string) : undefined}>
                    {cell.column.id === "status" ? <Badge tone={row.original.status === "submitted" ? "success" : "neutral"}>{cell.getValue() as string}</Badge> : <table.FlexRender cell={cell} />}
                  </td>
                ))}
                <td className="px-3 py-1 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setDetail(row.original)}>
                    View<span className="sr-only"> response from {formatDateTime(row.original.submittedAt ?? row.original.startedAt)}</span>
                  </Button>
                </td>
              </tr>
            ))}
            {padBottom > 0 ? (
              <tr aria-hidden="true">
                <td style={{ height: padBottom }} />
              </tr>
            ) : null}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-fg-muted">No responses match.</p> : null}
      </div>

      <ResponseDetail response={detail} onClose={() => setDetail(null)} form={detail ? formFor(detail.versionId) : undefined} versionLabel={versionLabel} />
    </div>
  );
}

function ResponseDetail({ response, onClose, form, versionLabel }: { response: ResponseRecord | null; onClose: () => void; form: FormDefinition | undefined; versionLabel: (id: string) => string }) {
  return (
    <Dialog open={!!response} onClose={onClose} variant="drawer" title="Response" description={response ? `${response.status === "submitted" ? `Submitted ${formatDateTime(response.submittedAt!)}` : `In progress, started ${formatDateTime(response.startedAt)}`} · ${versionLabel(response.versionId)}` : undefined}>
      {response && form ? (
        <div className="flex flex-col gap-5">
          {form.steps
            .filter((s) => s.kind === "questions")
            .map((s) => (
              <section key={s.id}>
                <h3 className="mb-2 text-sm font-semibold text-fg-muted">{s.title}</h3>
                <dl className="divide-y divide-line rounded-card border border-line">
                  {s.fields.map((f) => {
                    const text = formatAnswer(f, response.answers[f.id]);
                    return (
                      <div key={f.id} className="px-3 py-2">
                        <dt className="text-sm text-fg-muted">{f.label}</dt>
                        <dd className={cn("text-sm break-words whitespace-pre-wrap", !text && "text-fg-muted italic")}>{text || "No answer"}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
        </div>
      ) : null}
    </Dialog>
  );
}
