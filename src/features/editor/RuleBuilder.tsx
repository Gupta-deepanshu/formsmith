"use client";

import { useShallow } from "zustand/react/shallow";
import { Button, Icon, IconButton, Input, Select } from "@/components/ui";
import { FIELD_TYPE_META, isChoiceField, type Clause, type Condition, type Field, type Operator } from "@/core";
import { useEditor, useEditorActions, type EditorState } from "./store";

/**
 * "Show only if" editor. Offers only questions that come BEFORE the owner, the same rule
 * the core analyser enforces, so the UI can't build forward references or cycles.
 */

const OP_LABELS: Record<Operator, (kind: string) => string> = {
  equals: () => "is",
  notEquals: () => "is not",
  in: () => "is any of",
  notIn: () => "is none of",
  contains: (k) => (k === "choices" ? "includes" : "contains"),
  notContains: (k) => (k === "choices" ? "doesn't include" : "doesn't contain"),
  gt: (k) => (k === "date" ? "is after" : "is greater than"),
  gte: (k) => (k === "date" ? "is on or after" : "is at least"),
  lt: (k) => (k === "date" ? "is before" : "is less than"),
  lte: (k) => (k === "date" ? "is on or before" : "is at most"),
  isAnswered: () => "is answered",
  isEmpty: () => "is not answered",
};

const NO_VALUE: Operator[] = ["isAnswered", "isEmpty"];
const MULTI: Operator[] = ["in", "notIn"];

function defaultValue(field: Field, op: Operator): Clause["value"] {
  if (NO_VALUE.includes(op)) return undefined;
  if (isChoiceField(field)) return MULTI.includes(op) || field.type === "multipleChoice" && (op === "equals" || op === "notEquals") ? [field.options[0]!.id] : field.options[0]!.id;
  const kind = FIELD_TYPE_META[field.type].answerKind;
  if (kind === "boolean") return true;
  if (kind === "number") return field.type === "rating" ? 3 : 0;
  if (kind === "date") return new Date().toISOString().slice(0, 10);
  return "";
}

export function makeClause(field: Field): Clause {
  const op = FIELD_TYPE_META[field.type].operators[0]!;
  const value = defaultValue(field, op);
  return value === undefined ? { fieldId: field.id, op } : { fieldId: field.id, op, value };
}

/** Ids of fields before the owner, in reading order. */
function candidatesFor(s: EditorState, owner: { kind: "step" | "field"; id: string }): string[] {
  const out: string[] = [];
  for (const sid of s.form.stepOrder) {
    if (owner.kind === "step" && sid === owner.id) break;
    for (const fid of s.form.steps[sid]!.fieldIds) {
      if (owner.kind === "field" && fid === owner.id) return out;
      out.push(fid);
    }
  }
  return out;
}

export function RuleBuilder({ owner }: { owner: { kind: "step" | "field"; id: string } }) {
  const candidateIds = useEditor(useShallow((s) => candidatesFor(s, owner)));
  const fields = useEditor(useShallow((s) => candidateIds.map((id) => s.form.fields[id]!)));
  const condition = useEditor((s) => (owner.kind === "step" ? s.form.steps[owner.id]?.visibleIf : s.form.fields[owner.id]?.visibleIf));
  const { dispatch } = useEditorActions();

  const write = (next: Condition | undefined) =>
    dispatch(owner.kind === "step" ? [{ op: "updateStep", stepId: owner.id, changes: { visibleIf: next } }] : [{ op: "updateField", fieldId: owner.id, changes: { visibleIf: next } }], { label: next ? "Edit rule" : "Remove rule" });

  if (!condition) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">Always shown.</p>
        {fields.length ? (
          <Button size="sm" className="self-start" leadingIcon={<Icon name="rule" />} onClick={() => write({ all: [makeClause(fields.at(-1)!)] })}>
            Add a rule
          </Button>
        ) : (
          <p className="text-sm text-fg-muted">Rules can only depend on earlier questions. Add a question before this {owner.kind === "step" ? "step" : "one"} first.</p>
        )}
      </div>
    );
  }

  const match = "all" in condition ? "all" : "any";
  const clauses = "all" in condition ? condition.all : condition.any;
  const setClauses = (next: Clause[]) => write(next.length === 0 ? undefined : match === "all" ? { all: next } : { any: next });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Show only if</span>
        <div className="w-24">
          <Select aria-label="Match" value={match} onChange={(e) => write(e.target.value === "all" ? { all: clauses } : { any: clauses })} options={[{ value: "all", label: "all" }, { value: "any", label: "any" }]} />
        </div>
        <span>of these are true:</span>
      </div>
      <ol className="flex flex-col gap-2">
        {clauses.map((c, i) => (
          <ClauseRow
            key={i}
            index={i}
            clause={c}
            fields={fields}
            onChange={(next) => setClauses(clauses.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setClauses(clauses.filter((_, j) => j !== i))}
          />
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {fields.length && clauses.length < 10 ? (
          <Button size="sm" variant="ghost" leadingIcon={<Icon name="plus" />} onClick={() => setClauses([...clauses, makeClause(fields.at(-1)!)])}>
            Add condition
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => write(undefined)}>
          Remove rule
        </Button>
      </div>
    </div>
  );
}

function ClauseRow({ clause, fields, index, onChange, onRemove }: { clause: Clause; fields: Field[]; index: number; onChange: (c: Clause) => void; onRemove: () => void }) {
  const field = fields.find((f) => f.id === clause.fieldId);
  const kind = field ? FIELD_TYPE_META[field.type].answerKind : "text";
  const n = index + 1;
  return (
    <li className="flex flex-col gap-2 rounded-control border border-line bg-subtle p-2">
      <div className="flex items-center gap-2">
        <Select
          aria-label={`Condition ${n}: question`}
          value={field ? clause.fieldId : ""}
          placeholder={field ? undefined : "Question no longer available"}
          onChange={(e) => {
            const f = fields.find((x) => x.id === e.target.value);
            if (f) onChange(makeClause(f));
          }}
          options={fields.map((f) => ({ value: f.id, label: f.label || "Untitled question" }))}
        />
        <IconButton size="sm" variant="ghost" label={`Remove condition ${n}`} icon={<Icon name="x" />} onClick={onRemove} />
      </div>
      {field ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-44">
            <Select
              aria-label={`Condition ${n}: operator`}
              value={clause.op}
              onChange={(e) => {
                const op = e.target.value as Operator;
                const value = NO_VALUE.includes(op) ? undefined : MULTI.includes(op) !== MULTI.includes(clause.op) || NO_VALUE.includes(clause.op) ? defaultValue(field, op) : clause.value;
                onChange(value === undefined ? { fieldId: clause.fieldId, op } : { fieldId: clause.fieldId, op, value });
              }}
              options={FIELD_TYPE_META[field.type].operators.map((op) => ({ value: op, label: OP_LABELS[op](kind) }))}
            />
          </div>
          {!NO_VALUE.includes(clause.op) ? <ValueEditor field={field} clause={clause} label={`Condition ${n}: value`} onChange={(value) => onChange({ ...clause, value })} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function ValueEditor({ field, clause, label, onChange }: { field: Field; clause: Clause; label: string; onChange: (v: Clause["value"]) => void }) {
  if (isChoiceField(field)) {
    const multi = Array.isArray(clause.value);
    if (multi) {
      const selected = clause.value as string[];
      return (
        <fieldset className="flex flex-1 flex-wrap gap-x-3 gap-y-1">
          <legend className="sr-only">{label}</legend>
          {field.options.map((o) => (
            <label key={o.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={selected.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((x) => x !== o.id))} />
              {o.label}
            </label>
          ))}
        </fieldset>
      );
    }
    return (
      <div className="flex-1">
        <Select aria-label={label} value={String(clause.value ?? "")} onChange={(e) => onChange(e.target.value)} options={field.options.map((o) => ({ value: o.id, label: o.label }))} />
      </div>
    );
  }
  const kind = FIELD_TYPE_META[field.type].answerKind;
  if (kind === "boolean") {
    return (
      <div className="flex-1">
        <Select aria-label={label} value={clause.value === false ? "false" : "true"} onChange={(e) => onChange(e.target.value === "true")} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />
      </div>
    );
  }
  if (kind === "number") {
    return <Input aria-label={label} inputMode="decimal" className="flex-1" value={clause.value === undefined ? "" : String(clause.value)} onChange={(e) => onChange(e.target.value === "" || Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))} />;
  }
  if (kind === "date") {
    return <Input aria-label={label} type="date" className="flex-1" value={String(clause.value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  return <Input aria-label={label} className="flex-1" value={String(clause.value ?? "")} onChange={(e) => onChange(e.target.value)} />;
}
