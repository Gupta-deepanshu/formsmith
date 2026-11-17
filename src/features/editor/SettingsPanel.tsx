"use client";

import { useState } from "react";
import { Button, Field, Icon, IconButton, Input, Select, Switch, Textarea } from "@/components/ui";
import {
  createId,
  FIELD_TYPE_META,
  FIELD_TYPES,
  isChoiceField,
  type ChoiceOption,
  type Field as FormField,
  type FieldChanges,
  type FieldType,
} from "@/core";
import { RuleBuilder } from "./RuleBuilder";
import { EMPTY_ISSUES, useEditor, useEditorActions } from "./store";

/** Right panel: settings for whatever is selected (question, step, or the form). */
export function SettingsPanel() {
  const selection = useEditor((s) => s.selection);
  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-4">
      <h2 id="settings-heading" className="sr-only">
        Settings
      </h2>
      {selection.kind === "field" ? (
        <FieldSettings key={selection.id} id={selection.id} />
      ) : selection.kind === "step" ? (
        <StepSettings key={selection.id} id={selection.id} />
      ) : (
        <FormSettingsPanel />
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Issues({ id }: { id: string }) {
  const issues = useEditor((s) => s.issuesByTarget[id] ?? EMPTY_ISSUES);
  if (!issues.length) return null;
  return (
    <ul
      className="flex flex-col gap-1 rounded-control bg-danger-soft p-3 text-sm text-danger"
      aria-label="Problems"
    >
      {issues.map((i, k) => (
        <li key={k} className="flex gap-1.5">
          <Icon name="alert" className="mt-0.5" />
          {i.message}
        </li>
      ))}
    </ul>
  );
}

/** Text input for optional numbers: keeps the typed text locally (so "-" or "1." are allowed mid-typing). */
function NumberSetting({
  label,
  value,
  onChange,
  integer,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  integer?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Value changed from outside (undo, AI): adopt it. (Render-phase sync, per React docs.)
    setLastValue(value);
    setText(value === undefined ? "" : String(value));
  }
  return (
    <Field label={label}>
      <Input
        inputMode={integer ? "numeric" : "decimal"}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") return onChange(undefined);
          const n = Number(t);
          if (Number.isFinite(n)) {
            const v = integer ? Math.round(n) : n;
            setLastValue(v);
            onChange(v);
          }
        }}
      />
    </Field>
  );
}

const optional = (s: string) => (s.trim() === "" ? undefined : s);

function FieldSettings({ id }: { id: string }) {
  const field = useEditor((s) => s.form.fields[id]);
  const { dispatch } = useEditorActions();
  if (!field) return null;
  const update = (changes: FieldChanges, label = "Edit question") =>
    dispatch([{ op: "updateField", fieldId: id, changes }], { label });
  const hasPlaceholder = "placeholder" in FIELD_SCHEMA_KEYS[field.type];

  return (
    <>
      <Issues id={id} />
      <Section title="Question">
        <Field label="Label" required>
          <Textarea
            rows={2}
            value={field.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <Select
            value={field.type}
            onChange={(e) => update({ type: e.target.value as FieldType }, "Change question type")}
            options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_META[t].label }))}
          />
        </Field>
        <Switch
          label="Required"
          checked={field.required}
          onChange={(required) =>
            update({ required }, required ? "Make required" : "Make optional")
          }
        />
        {hasPlaceholder ? (
          <Field label="Placeholder">
            <Input
              value={(field as { placeholder?: string }).placeholder ?? ""}
              onChange={(e) => update({ placeholder: optional(e.target.value) })}
            />
          </Field>
        ) : null}
        <Field label="Help text" help="Shown under the label.">
          <Textarea
            rows={2}
            value={field.helpText ?? ""}
            onChange={(e) => update({ helpText: optional(e.target.value) })}
          />
        </Field>
      </Section>

      {isChoiceField(field) ? (
        <Section title="Options">
          <OptionsEditor options={field.options} onChange={(options) => update({ options })} />
        </Section>
      ) : null}

      <TypeValidation field={field} update={update} />

      <Section title="Show only if">
        <RuleBuilder owner={{ kind: "field", id }} />
      </Section>
    </>
  );
}

/** Which optional keys each type supports, for showing the right inputs. */
const FIELD_SCHEMA_KEYS: Record<FieldType, Record<string, true>> = {
  shortText: { placeholder: true },
  longText: { placeholder: true },
  email: { placeholder: true },
  phone: { placeholder: true },
  url: { placeholder: true },
  number: { placeholder: true },
  dropdown: { placeholder: true },
  singleChoice: {},
  multipleChoice: {},
  date: {},
  rating: {},
  yesNo: {},
};

function TypeValidation({
  field,
  update,
}: {
  field: FormField;
  update: (c: FieldChanges, label?: string) => void;
}) {
  switch (field.type) {
    case "shortText":
    case "longText":
      return (
        <Section title="Validation">
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting
              label="Min length"
              integer
              value={field.minLength}
              onChange={(minLength) => update({ minLength })}
            />
            <NumberSetting
              label="Max length"
              integer
              value={field.maxLength}
              onChange={(maxLength) => update({ maxLength })}
            />
          </div>
          {field.type === "shortText" ? (
            <>
              <Field
                label="Pattern (regular expression)"
                help="Optional. For example ^[A-Z]{2}[0-9]{6}$"
              >
                <Input
                  className="font-mono"
                  value={field.pattern?.regex ?? ""}
                  onChange={(e) =>
                    update({
                      pattern: e.target.value
                        ? {
                            regex: e.target.value,
                            message: field.pattern?.message ?? "Use the expected format.",
                          }
                        : undefined,
                    })
                  }
                />
              </Field>
              {field.pattern ? (
                <Field label="Message when the pattern doesn't match">
                  <Input
                    value={field.pattern.message}
                    onChange={(e) =>
                      update({ pattern: { regex: field.pattern!.regex, message: e.target.value } })
                    }
                  />
                </Field>
              ) : null}
            </>
          ) : null}
        </Section>
      );
    case "number":
      return (
        <Section title="Validation">
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting label="Minimum" value={field.min} onChange={(min) => update({ min })} />
            <NumberSetting label="Maximum" value={field.max} onChange={(max) => update({ max })} />
          </div>
          <Switch
            label="Whole numbers only"
            checked={!!field.integer}
            onChange={(integer) => update({ integer: integer || undefined })}
          />
        </Section>
      );
    case "multipleChoice":
      return (
        <Section title="Validation">
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting
              label="Min selections"
              integer
              value={field.minSelected}
              onChange={(minSelected) => update({ minSelected })}
            />
            <NumberSetting
              label="Max selections"
              integer
              value={field.maxSelected}
              onChange={(maxSelected) => update({ maxSelected })}
            />
          </div>
        </Section>
      );
    case "date":
      return (
        <Section title="Validation">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Earliest date">
              <Input
                type="date"
                value={field.minDate ?? ""}
                onChange={(e) => update({ minDate: optional(e.target.value) })}
              />
            </Field>
            <Field label="Latest date">
              <Input
                type="date"
                value={field.maxDate ?? ""}
                onChange={(e) => update({ maxDate: optional(e.target.value) })}
              />
            </Field>
          </div>
        </Section>
      );
    case "rating":
      return (
        <Section title="Labels">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Label for 1">
              <Input
                value={field.lowLabel ?? ""}
                onChange={(e) => update({ lowLabel: optional(e.target.value) })}
              />
            </Field>
            <Field label="Label for 5">
              <Input
                value={field.highLabel ?? ""}
                onChange={(e) => update({ highLabel: optional(e.target.value) })}
              />
            </Field>
          </div>
        </Section>
      );
    case "email":
    case "url":
    case "phone":
      return (
        <Section title="Validation">
          <p className="text-sm text-fg-muted">
            Checked automatically for a valid {FIELD_TYPE_META[field.type].label.toLowerCase()}
            {field.type === "url" ? " (http or https; https:// is added if missing)" : ""}.
          </p>
        </Section>
      );
    default:
      return null;
  }
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: ChoiceOption[];
  onChange: (o: ChoiceOption[]) => void;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const next = options.slice();
    const [o] = next.splice(i, 1);
    next.splice(i + dir, 0, o!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-1">
            <Input
              aria-label={`Option ${i + 1}`}
              value={o.label}
              onChange={(e) =>
                onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))
              }
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`Move option ${i + 1} up`}
              icon={<Icon name="arrowUp" />}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`Move option ${i + 1} down`}
              icon={<Icon name="arrowDown" />}
              disabled={i === options.length - 1}
              onClick={() => move(i, 1)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`Remove option ${i + 1}`}
              icon={<Icon name="x" />}
              disabled={options.length <= 1}
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}
            />
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        leadingIcon={<Icon name="plus" />}
        disabled={options.length >= 50}
        onClick={() =>
          onChange([...options, { id: createId("o"), label: `Option ${options.length + 1}` }])
        }
      >
        Add option
      </Button>
    </div>
  );
}

function StepSettings({ id }: { id: string }) {
  const step = useEditor((s) => s.form.steps[id]);
  const { dispatch } = useEditorActions();
  if (!step) return null;
  const update = (changes: { title?: string; description?: string | undefined }) =>
    dispatch([{ op: "updateStep", stepId: id, changes }], { label: "Edit step" });
  return (
    <>
      <Issues id={id} />
      <Section title={step.kind === "review" ? "Review step" : "Step"}>
        <Field label="Title" required>
          <Input value={step.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Description">
          <Textarea
            rows={2}
            value={step.description ?? ""}
            onChange={(e) => update({ description: optional(e.target.value) })}
          />
        </Field>
      </Section>
      <Section title="Show only if">
        <RuleBuilder owner={{ kind: "step", id }} />
      </Section>
    </>
  );
}

function FormSettingsPanel() {
  const meta = useEditor((s) => s.form.meta);
  const formIssues = useEditor((s) => s.issuesByTarget.__form ?? EMPTY_ISSUES);
  const { dispatch } = useEditorActions();
  const update = (
    changes: Parameters<typeof dispatch>[0][number] extends infer O
      ? O extends { op: "updateForm"; changes: infer C }
        ? C
        : never
      : never,
  ) => dispatch([{ op: "updateForm", changes }], { label: "Edit form settings" });
  return (
    <>
      {formIssues.length ? (
        <ul className="flex flex-col gap-1 rounded-control bg-danger-soft p-3 text-sm text-danger">
          {formIssues.map((i, k) => (
            <li key={k}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      <Section title="Form">
        <Field label="Title" required>
          <Input value={meta.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Description" help="Shown at the top of the form.">
          <Textarea
            rows={3}
            value={meta.description ?? ""}
            onChange={(e) => update({ description: optional(e.target.value) })}
          />
        </Field>
      </Section>
      <Section title="Submission">
        <Field label="Submit button label" required>
          <Input
            value={meta.settings.submitLabel}
            maxLength={40}
            onChange={(e) =>
              update({ settings: { ...meta.settings, submitLabel: e.target.value } })
            }
          />
        </Field>
        <Field label="Confirmation title" required>
          <Input
            value={meta.settings.confirmation.title}
            onChange={(e) =>
              update({
                settings: {
                  ...meta.settings,
                  confirmation: { ...meta.settings.confirmation, title: e.target.value },
                },
              })
            }
          />
        </Field>
        <Field label="Confirmation message">
          <Textarea
            rows={2}
            value={meta.settings.confirmation.message}
            onChange={(e) =>
              update({
                settings: {
                  ...meta.settings,
                  confirmation: { ...meta.settings.confirmation, message: e.target.value },
                },
              })
            }
          />
        </Field>
      </Section>
    </>
  );
}
