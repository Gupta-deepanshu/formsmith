"use client";

import { memo, type KeyboardEvent } from "react";
import { Badge, Button, Icon, IconButton, useToast } from "@/components/ui";
import {
  createId,
  duplicateFieldOps,
  FIELD_TYPE_META,
  FIELD_TYPES,
  newField,
  nudgeFieldOps,
  nudgeStepOps,
  removeFieldOps,
  removeStepOps,
  type FieldType,
} from "@/core";
import { cn } from "@/lib/cn";
import { EMPTY_ISSUES, useEditor, useEditorActions, useEditorStore } from "./store";

/** Focus a structure row after a move/remove (moved DOM nodes lose focus, and cross-step moves remount). */
function focusRow(id: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus(),
  );
}

/** Arrow keys move focus between rows (like a tree), without changing the tab order. */
function moveFocus(from: HTMLElement, dir: 1 | -1) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-row-id]"));
  rows[rows.indexOf(from) + dir]?.focus();
}

export function StructurePanel() {
  const stepOrder = useEditor((s) => s.form.stepOrder);
  const hasReview = useEditor((s) =>
    s.form.stepOrder.some((id) => s.form.steps[id]!.kind === "review"),
  );
  const { dispatch } = useEditorActions();

  const addStep = (kind: "questions" | "review") => {
    const id = createId("s");
    const questionSteps = stepOrder.length - (hasReview ? 1 : 0);
    // New question steps go before a trailing review step; the review step always goes last.
    const index = kind === "review" ? stepOrder.length : questionSteps;
    const field = newField("shortText");
    dispatch(
      [
        {
          op: "addStep",
          index,
          step:
            kind === "review"
              ? { id, title: "Review your answers", kind, fields: [] }
              : { id, title: `Step ${questionSteps + 1}`, kind, fields: [field] },
        },
      ],
      {
        label: "Add step",
        select: kind === "review" ? { kind: "step", id } : { kind: "field", id: field.id },
      },
    );
  };

  return (
    <nav aria-label="Form structure" className="flex flex-col gap-3">
      <FormRow />
      <ol className="flex flex-col gap-3">
        {stepOrder.map((id, i) => (
          <StepBlock key={id} id={id} index={i} count={stepOrder.length} />
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => addStep("questions")} leadingIcon={<Icon name="plus" />}>
          Add step
        </Button>
        {!hasReview ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => addStep("review")}
            leadingIcon={<Icon name="plus" />}
          >
            Add review step
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

function FormRow() {
  const title = useEditor((s) => s.form.meta.title);
  const selected = useEditor((s) => s.selection.kind === "form");
  const { select } = useEditorActions();
  return (
    <button
      type="button"
      data-row-id="__form"
      aria-current={selected || undefined}
      onClick={() => select({ kind: "form" })}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(e.currentTarget, 1);
        }
      }}
      className={cn(
        "flex items-center gap-2 rounded-control border px-3 py-2 text-left text-sm",
        selected
          ? "border-accent bg-accent-soft"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <Icon name="form" className="text-fg-muted" />
      <span className="truncate font-medium">{title || "Untitled form"}</span>
      <span className="ml-auto text-xs text-fg-muted">Form settings</span>
    </button>
  );
}

const StepBlock = memo(function StepBlock({
  id,
  index,
  count,
}: {
  id: string;
  index: number;
  count: number;
}) {
  const step = useEditor((s) => s.form.steps[id]);
  const selected = useEditor((s) => s.selection.kind === "step" && s.selection.id === id);
  const issues = useEditor((s) => s.issuesByTarget[id] ?? EMPTY_ISSUES);
  const highlighted = useEditor((s) => s.aiHighlight?.stepIds.includes(id) ?? false);
  const { dispatch, select, undo } = useEditorActions();
  const store = useEditorStore();
  const toast = useToast();
  if (!step) return null;

  const remove = () => {
    if (count <= 1) {
      toast.show({ message: "A form needs at least one step.", tone: "danger" });
      return;
    }
    dispatch(removeStepOps(store.getState().form, id), {
      label: "Delete step",
      select: { kind: "form" },
    });
    toast.show({
      message: `Deleted step "${step.title}".`,
      action: { label: "Undo", onClick: undo },
    });
    focusRow("__form");
  };
  const nudge = (dir: -1 | 1) => {
    dispatch(nudgeStepOps(store.getState().form, id, dir), { label: "Move step" });
    focusRow(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      nudge(-1);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      nudge(1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(e.currentTarget, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(e.currentTarget, -1);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      remove();
    }
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return (
    <li
      className={cn(
        "rounded-card border bg-surface",
        highlighted ? "animate-highlight border-accent" : "border-line",
      )}
    >
      <div className="group flex items-center gap-1 border-b border-line p-1.5">
        <button
          type="button"
          data-row-id={id}
          aria-current={selected || undefined}
          onClick={() => select({ kind: "step", id })}
          onKeyDown={onKeyDown}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm",
            selected ? "bg-accent-soft" : "hover:bg-subtle",
          )}
        >
          <span className="text-xs font-semibold text-fg-muted tabular-nums">{index + 1}</span>
          <span className="truncate font-semibold">{step.title || "Untitled step"}</span>
          {step.kind === "review" ? <Badge>Review</Badge> : null}
          {step.visibleIf ? (
            <Icon name="rule" className="text-accent" label="Has a show-only-if rule" />
          ) : null}
          {errorCount ? <IssueDot count={errorCount} /> : null}
        </button>
        <RowActions
          label={step.title}
          canUp={index > 0}
          canDown={index < count - 1}
          onUp={() => nudge(-1)}
          onDown={() => nudge(1)}
          onDelete={remove}
        />
      </div>
      {step.kind === "questions" ? (
        <div className="flex flex-col gap-1 p-1.5">
          {step.fieldIds.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-fg-muted">No questions yet.</p>
          ) : null}
          <ol className="flex flex-col gap-1" aria-label={`Questions in ${step.title}`}>
            {step.fieldIds.map((fid, i) => (
              <FieldRow
                key={fid}
                id={fid}
                stepIndex={index}
                index={i}
                isFirstOverall={index === 0 && i === 0}
              />
            ))}
          </ol>
          <AddFieldMenu stepId={id} />
        </div>
      ) : (
        <p className="p-3 text-sm text-fg-muted">
          Shows the respondent&apos;s answers before they submit.
        </p>
      )}
    </li>
  );
});

const FieldRow = memo(function FieldRow({
  id,
  isFirstOverall,
}: {
  id: string;
  stepIndex: number;
  index: number;
  isFirstOverall: boolean;
}) {
  const field = useEditor((s) => s.form.fields[id]);
  const selected = useEditor((s) => s.selection.kind === "field" && s.selection.id === id);
  const issues = useEditor((s) => s.issuesByTarget[id] ?? EMPTY_ISSUES);
  const highlighted = useEditor((s) => s.aiHighlight?.fieldIds.includes(id) ?? false);
  const isLastOverall = useEditor((s) => {
    const lastStep = [...s.form.stepOrder]
      .reverse()
      .find((sid) => s.form.steps[sid]!.kind === "questions");
    return !!lastStep && s.form.steps[lastStep]!.fieldIds.at(-1) === id;
  });
  const { dispatch, select, undo } = useEditorActions();
  const store = useEditorStore();
  const toast = useToast();
  if (!field) return null;

  const nudge = (dir: -1 | 1) => {
    dispatch(nudgeFieldOps(store.getState().form, id, dir), { label: "Move question" });
    focusRow(id);
  };
  const remove = () => {
    dispatch(removeFieldOps(store.getState().form, id), { label: "Delete question" });
    toast.show({ message: `Deleted "${field.label}".`, action: { label: "Undo", onClick: undo } });
  };
  const duplicate = () => {
    const d = duplicateFieldOps(store.getState().form, id);
    if (!d) return;
    dispatch(d.ops, { label: "Duplicate question", select: { kind: "field", id: d.newId } });
    focusRow(d.newId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      nudge(-1);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      nudge(1);
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate();
    } else if (e.key === "Delete" || (e.key === "Backspace" && mod)) {
      e.preventDefault();
      moveFocus(e.currentTarget, -1);
      remove();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(e.currentTarget, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(e.currentTarget, -1);
    }
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-control",
        highlighted && "animate-highlight",
      )}
    >
      <button
        type="button"
        data-row-id={id}
        aria-current={selected || undefined}
        onClick={() => select({ kind: "field", id })}
        onKeyDown={onKeyDown}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Control+D Delete"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm",
          selected ? "bg-accent-soft" : "hover:bg-subtle",
        )}
      >
        <span className="truncate">{field.label || "Untitled question"}</span>
        {field.required ? (
          <span className="text-danger" aria-label="required">
            *
          </span>
        ) : null}
        {field.visibleIf ? (
          <Icon name="rule" className="text-accent" label="Has a show-only-if rule" />
        ) : null}
        {errorCount ? <IssueDot count={errorCount} /> : null}
        <span className="ml-auto shrink-0 text-xs text-fg-muted">
          {FIELD_TYPE_META[field.type].label}
        </span>
      </button>
      <RowActions
        label={field.label}
        canUp={!isFirstOverall}
        canDown={!isLastOverall}
        onUp={() => nudge(-1)}
        onDown={() => nudge(1)}
        onDelete={remove}
        onDuplicate={duplicate}
      />
    </li>
  );
});

function RowActions({
  label,
  canUp,
  canDown,
  onUp,
  onDown,
  onDelete,
  onDuplicate,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center opacity-100 transition-opacity duration-150 focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
      <IconButton
        size="sm"
        variant="ghost"
        label={`Move "${label}" up`}
        icon={<Icon name="arrowUp" />}
        onClick={onUp}
        disabled={!canUp}
        tabIndex={-1}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={`Move "${label}" down`}
        icon={<Icon name="arrowDown" />}
        onClick={onDown}
        disabled={!canDown}
        tabIndex={-1}
      />
      {onDuplicate ? (
        <IconButton
          size="sm"
          variant="ghost"
          label={`Duplicate "${label}"`}
          icon={<Icon name="copy" />}
          onClick={onDuplicate}
          tabIndex={-1}
        />
      ) : null}
      <IconButton
        size="sm"
        variant="ghost"
        label={`Delete "${label}"`}
        icon={<Icon name="trash" />}
        onClick={onDelete}
        tabIndex={-1}
      />
    </div>
  );
}

function IssueDot({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-medium text-danger"
      aria-label={`${count} ${count === 1 ? "problem" : "problems"}`}
    >
      <Icon name="alert" className="size-3.5" />
      {count}
    </span>
  );
}

function AddFieldMenu({ stepId }: { stepId: string }) {
  const { dispatch } = useEditorActions();
  const store = useEditorStore();
  const add = (type: FieldType, details: HTMLDetailsElement | null) => {
    const field = newField(type);
    const step = store.getState().form.steps[stepId];
    dispatch([{ op: "addField", stepId, index: step?.fieldIds.length ?? 0, field }], {
      label: "Add question",
      select: { kind: "field", id: field.id },
    });
    if (details) details.open = false;
    focusRow(field.id);
  };
  return (
    <details className="group/add relative [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control px-2 py-1.5 text-sm text-accent hover:bg-accent-soft">
        <Icon name="plus" />
        Add question
      </summary>
      <div className="absolute left-0 z-20 mt-1 grid w-64 animate-fade grid-cols-2 gap-1 rounded-card border border-line bg-surface p-2 shadow-card">
        {FIELD_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={(e) => add(t, e.currentTarget.closest("details"))}
            className="rounded-control px-2 py-1.5 text-left text-sm hover:bg-subtle"
          >
            {FIELD_TYPE_META[t].label}
          </button>
        ))}
      </div>
    </details>
  );
}
