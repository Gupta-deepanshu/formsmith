"use client";

import { createContext, use } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import {
  afterRedo,
  afterUndo,
  applyOps,
  coalesceKeyFor,
  denormalize,
  EMPTY_HISTORY,
  locateField,
  normalize,
  peekRedo,
  peekUndo,
  record,
  validateForm,
  type FormDefinition,
  type FormIssue,
  type History,
  type NormalizedForm,
  type PatchOp,
} from "@/core";

/**
 * Editor state (Zustand, one store per editor instance via context).
 *
 * - The form is NORMALISED (id-keyed maps). Core patch ops apply with structural sharing,
 *   so after typing in one field only that field's object changes, and components
 *   selecting other fields keep their old references and don't re-render.
 * - EVERY change goes through dispatch(ops) -> core applyOps -> history. No ad-hoc
 *   setters, which is why undo/redo covers manual and AI edits alike.
 */

export type Selection =
  { kind: "form" } | { kind: "step"; id: string } | { kind: "field"; id: string };
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

export type AiHighlight = {
  fieldIds: string[];
  stepIds: string[];
  summary: string;
  historyAt: number;
  applied: number;
  skipped: number;
};

export type EditorState = {
  form: NormalizedForm;
  history: History;
  selection: Selection;
  previewStepId: string | null;
  issues: FormIssue[];
  /** Issues per step/field id. Arrays keep their identity while unchanged (stable selectors). */
  issuesByTarget: Record<string, FormIssue[]>;
  /** Bumps on every change; autosave compares it with the last saved revision. */
  revision: number;
  savedRevision: number;
  save: { status: SaveStatus; savedAt: string | null; message?: string };
  aiHighlight: AiHighlight | null;
  /** Snapshot of the published version, for the "unpublished changes" badge. */
  publishedJson: string | null;
  actions: {
    dispatch: (
      ops: PatchOp[],
      meta?: { label?: string; source?: "manual" | "ai"; select?: Selection },
    ) => boolean;
    undo: () => void;
    redo: () => void;
    select: (sel: Selection) => void;
    setPreviewStep: (stepId: string | null) => void;
    markSaving: () => void;
    markSaved: (revision: number, savedAt: string) => void;
    markSaveFailed: (status: "error" | "offline", message?: string) => void;
    setAiHighlight: (h: AiHighlight | null) => void;
    markPublished: () => void;
    reset: (form: FormDefinition) => void;
  };
};

export const EMPTY_ISSUES: FormIssue[] = [];

function computeIssues(nf: NormalizedForm, prev?: Record<string, FormIssue[]>) {
  const issues = validateForm(denormalize(nf)).issues;
  const byTarget: Record<string, FormIssue[]> = {};
  for (const i of issues) {
    const k = i.targetId ?? "__form";
    (byTarget[k] ??= []).push(i);
  }
  if (prev) {
    for (const k of Object.keys(byTarget)) {
      const old = prev[k];
      if (old && JSON.stringify(old) === JSON.stringify(byTarget[k])) byTarget[k] = old;
    }
  }
  return { issues, issuesByTarget: byTarget };
}

function stepOf(nf: NormalizedForm, sel: Selection): string | null {
  if (sel.kind === "step") return sel.id;
  if (sel.kind === "field") return locateField(nf, sel.id)?.stepId ?? null;
  return null;
}

/** Keep the selection pointing at something that exists (after undo of an add, delete, etc.). */
function repairSelection(nf: NormalizedForm, sel: Selection): Selection {
  if (sel.kind === "field" && !nf.fields[sel.id]) return { kind: "form" };
  if (sel.kind === "step" && !nf.steps[sel.id]) return { kind: "form" };
  return sel;
}

export type EditorInit = {
  form: FormDefinition;
  savedAt?: string | null;
  publishedForm?: FormDefinition | null;
};

export function createEditorStore(init: EditorInit): StoreApi<EditorState> {
  const nf = normalize(init.form);
  const firstField = nf.stepOrder.map((s) => nf.steps[s]!.fieldIds[0]).find(Boolean);

  return createStore<EditorState>()((set, get) => ({
    form: nf,
    history: EMPTY_HISTORY,
    selection: firstField ? { kind: "field", id: firstField } : { kind: "form" },
    previewStepId: nf.stepOrder[0] ?? null,
    ...computeIssues(nf),
    revision: 0,
    savedRevision: 0,
    save: { status: init.savedAt ? "saved" : "idle", savedAt: init.savedAt ?? null },
    aiHighlight: null,
    publishedJson: init.publishedForm ? JSON.stringify(init.publishedForm) : null,
    actions: {
      dispatch(ops, meta = {}) {
        if (!ops.length) return true;
        const s = get();
        let result;
        try {
          result = applyOps(s.form, ops);
        } catch {
          return false; // PatchError: target missing; nothing changed
        }
        const source = meta.source ?? "manual";
        const history = record(s.history, {
          ops,
          inverse: result.inverse,
          source,
          label: meta.label ?? "Edit",
          at: Date.now(),
          coalesceKey: source === "manual" ? coalesceKeyFor(ops) : undefined,
        });
        const selection = repairSelection(result.form, meta.select ?? s.selection);
        set({
          form: result.form,
          history,
          selection,
          previewStepId: stepOf(result.form, selection) ?? s.previewStepId,
          ...computeIssues(result.form, s.issuesByTarget),
          revision: s.revision + 1,
          // A manual edit after an AI edit means the owner kept going: stop highlighting.
          aiHighlight: source === "manual" ? null : s.aiHighlight,
        });
        return true;
      },
      undo() {
        const s = get();
        const entry = peekUndo(s.history);
        if (!entry) return;
        const { form } = applyOps(s.form, entry.inverse);
        const selection = repairSelection(form, s.selection);
        set({
          form,
          history: afterUndo(s.history),
          selection,
          ...computeIssues(form, s.issuesByTarget),
          revision: s.revision + 1,
          aiHighlight: s.aiHighlight && s.aiHighlight.historyAt === entry.at ? null : s.aiHighlight,
        });
      },
      redo() {
        const s = get();
        const entry = peekRedo(s.history);
        if (!entry) return;
        const { form } = applyOps(s.form, entry.ops);
        set({
          form,
          history: afterRedo(s.history),
          selection: repairSelection(form, s.selection),
          ...computeIssues(form, s.issuesByTarget),
          revision: s.revision + 1,
        });
      },
      select(selection) {
        const s = get();
        set({ selection, previewStepId: stepOf(s.form, selection) ?? s.previewStepId });
      },
      setPreviewStep(previewStepId) {
        set({ previewStepId });
      },
      markSaving() {
        set((s) => ({ save: { ...s.save, status: "saving", message: undefined } }));
      },
      markSaved(revision, savedAt) {
        set((s) => ({
          savedRevision: Math.max(s.savedRevision, revision),
          save: { status: "saved", savedAt },
        }));
      },
      markSaveFailed(status, message) {
        set((s) => ({ save: { ...s.save, status, message } }));
      },
      setAiHighlight(aiHighlight) {
        set({ aiHighlight });
      },
      markPublished() {
        set((s) => ({ publishedJson: JSON.stringify(denormalize(s.form)) }));
      },
      reset(form) {
        const next = normalize(form);
        set({
          form: next,
          history: EMPTY_HISTORY,
          selection: { kind: "form" },
          previewStepId: next.stepOrder[0] ?? null,
          ...computeIssues(next),
          revision: get().revision + 1,
          aiHighlight: null,
        });
      },
    },
  }));
}

export const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null);

export function useEditorStore(): StoreApi<EditorState> {
  const store = use(EditorStoreContext);
  if (!store) throw new Error("useEditor must be used inside <EditorStoreContext>");
  return store;
}

/** Select a slice. Keep selectors narrow (one field, one flag) so components re-render only for their data. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(useEditorStore(), selector);
}

export const useEditorActions = () => useEditor((s) => s.actions);

/** The denormalised form, memoised per normalised-form reference. */
const denormCache = new WeakMap<NormalizedForm, FormDefinition>();
export function selectFormDefinition(s: EditorState): FormDefinition {
  let def = denormCache.get(s.form);
  if (!def) {
    def = denormalize(s.form);
    denormCache.set(s.form, def);
  }
  return def;
}
