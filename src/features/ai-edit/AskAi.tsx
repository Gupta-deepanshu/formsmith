"use client";

import { useState } from "react";
import { z } from "zod";
import { Button, Icon, Textarea, useToast } from "@/components/ui";
import { PatchOpSchema, type PatchOp } from "@/core";
import { AI_LIMITS } from "@/core/ai/schemas";
import { ensureSession } from "@/lib/supabase/client";
import {
  selectFormDefinition,
  useEditor,
  useEditorActions,
  useEditorStore,
} from "@/features/editor/store";

const EditResponse = z.object({
  summary: z.string(),
  ops: z.array(z.unknown()),
  rejected: z.array(z.object({ index: z.number(), reason: z.string() })),
  remaining: z.number().nullable().optional(),
});

export type AiErrorBody = { error?: string; reason?: string; retryAfterSeconds?: number };

export function aiErrorMessage(status: number, body: AiErrorBody): string {
  if (status === 429) {
    if (body.reason === "anonymous_limit")
      return "You've used your 3 AI requests in the sandbox. Sign in for more.";
    if (body.reason === "global")
      return "The AI is busy today (free-tier limit reached). Please try again later.";
    const mins = body.retryAfterSeconds ? Math.ceil(body.retryAfterSeconds / 60) : null;
    return mins
      ? `AI limit reached. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`
      : "AI limit reached. Please try again later.";
  }
  return body.error ?? "The AI request failed. Please try again.";
}

/**
 * "Ask AI" under the preview. Sends the form STRUCTURE only (never respondent answers),
 * receives validated patch ops, applies them as ONE history entry (so Ctrl+Z undoes the
 * whole AI edit), and highlights what changed with Keep / Undo.
 */
export function AskAi({ sandbox = false }: { sandbox?: boolean }) {
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const store = useEditorStore();
  const highlight = useEditor((s) => s.aiHighlight);
  const canUndoAi = useEditor(
    (s) => !!s.aiHighlight && s.history.past.at(-1)?.at === s.aiHighlight.historyAt,
  );
  const { dispatch, setAiHighlight, undo } = useEditorActions();
  const toast = useToast();

  const submit = async () => {
    const text = instruction.trim();
    if (!text || pending) return;
    setPending(true);
    try {
      if (sandbox) await ensureSession();
      const form = selectFormDefinition(store.getState());
      const res = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: text, form }),
      });
      const body = (await res.json().catch(() => ({}))) as AiErrorBody;
      if (!res.ok) {
        toast.show({ message: aiErrorMessage(res.status, body), tone: "danger" });
        return;
      }
      const parsed = EditResponse.safeParse(body);
      const ops = parsed.success ? z.array(PatchOpSchema).safeParse(parsed.data.ops) : null;
      if (!parsed.success || !ops?.success) {
        toast.show({ message: "The AI returned changes we couldn't apply.", tone: "danger" });
        return;
      }
      if (parsed.data.remaining != null) setRemaining(parsed.data.remaining);
      if (ops.data.length === 0) {
        toast.show({
          message: parsed.data.rejected.length
            ? `No changes applied: ${parsed.data.rejected[0]!.reason}`
            : "The AI didn't find anything to change.",
        });
        return;
      }
      const applied = dispatch(ops.data as PatchOp[], {
        source: "ai",
        label: `AI: ${parsed.data.summary}`,
      });
      if (!applied) {
        toast.show({
          message: "The form changed while the AI was working. Please try again.",
          tone: "danger",
        });
        return;
      }
      const after = store.getState();
      const changed = changedIds(ops.data as PatchOp[], after.form);
      setAiHighlight({
        ...changed,
        summary: parsed.data.summary,
        historyAt: after.history.past.at(-1)!.at,
        applied: ops.data.length,
        skipped: parsed.data.rejected.length,
      });
      setInstruction("");
    } catch {
      toast.show({ message: "Couldn't reach the AI. Check your connection.", tone: "danger" });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="ask-ai-heading"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <h2 id="ask-ai-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="sparkle" className="text-accent" />
        Ask AI to edit
      </h2>

      {highlight ? (
        <div
          className="flex animate-enter flex-col gap-2 rounded-control border border-accent bg-accent-soft p-3 text-sm"
          role="status"
        >
          <p>
            <span className="font-medium">{highlight.summary}</span>
            <span className="text-fg-muted">
              {" "}
              · {highlight.applied} change{highlight.applied === 1 ? "" : "s"} applied
              {highlight.skipped ? `, ${highlight.skipped} skipped` : ""}. Changed items are
              highlighted.
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => setAiHighlight(null)}>
              Keep changes
            </Button>
            <Button
              size="sm"
              onClick={undo}
              disabled={!canUndoAi}
              leadingIcon={<Icon name="undo" />}
            >
              Undo AI edit
            </Button>
          </div>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="ask-ai-input" className="sr-only">
          Instruction for the AI
        </label>
        <Textarea
          id="ask-ai-input"
          data-native-undo
          rows={2}
          maxLength={AI_LIMITS.instructionMax}
          placeholder='e.g. "Make phone optional and add a LinkedIn field"'
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          disabled={pending}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-muted">
            Only the form&apos;s structure is sent, never responses.
            {remaining != null
              ? ` ${remaining} AI request${remaining === 1 ? "" : "s"} left${sandbox ? "" : " this hour"}.`
              : sandbox
                ? " The sandbox allows 3 AI requests."
                : ""}
          </p>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            loading={pending}
            disabled={!instruction.trim()}
            leadingIcon={<Icon name="sparkle" />}
          >
            {pending ? "Thinking…" : "Apply"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function changedIds(
  ops: PatchOp[],
  form: { fields: Record<string, unknown>; steps: Record<string, unknown> },
) {
  const fieldIds = new Set<string>();
  const stepIds = new Set<string>();
  for (const op of ops) {
    if (op.op === "addField") fieldIds.add(op.field.id);
    else if (op.op === "updateField" || op.op === "moveField") fieldIds.add(op.fieldId);
    else if (op.op === "addStep") {
      stepIds.add(op.step.id);
      op.step.fields.forEach((f) => fieldIds.add(f.id));
    } else if (op.op === "updateStep" || op.op === "moveStep") stepIds.add(op.stepId);
  }
  return {
    fieldIds: [...fieldIds].filter((id) => id in form.fields),
    stepIds: [...stepIds].filter((id) => id in form.steps),
  };
}
