"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Dialog, Icon, Input, Spinner, useToast } from "@/components/ui";
import {
  FormRunner,
  type Progress,
  type SubmitOutcome,
} from "@/components/form-renderer/FormRunner";
import type { Answers, FormDefinition } from "@/core";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import {
  clearBackup,
  readBackup,
  useResponseAutosave,
  type SaveState,
} from "./useResponseAutosave";

export type PublicDraft = {
  id: string;
  answers: Answers;
  lastStepId: string | null;
  furthestStepIndex: number;
  updatedAt: string;
};

export function PublicForm({
  slug,
  versionId,
  isDemo,
  form,
  draft,
}: {
  slug: string;
  versionId: string;
  isDemo: boolean;
  form: FormDefinition;
  draft: PublicDraft | null;
}) {
  // Start from the server draft (same on server and client, so hydration matches)...
  const [start, setStart] = useState(() =>
    draft
      ? {
          answers: draft.answers,
          stepId: draft.lastStepId,
          furthest: draft.furthestStepIndex,
          restored: Object.keys(draft.answers).length > 0,
        }
      : { answers: {} as Answers, stepId: null as string | null, furthest: 0, restored: false },
  );
  const [seedKey, setSeedKey] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [resumeOpen, setResumeOpen] = useState(false);
  const autosave = useResponseAutosave({ versionId, initialResponseId: draft?.id ?? null });
  const latest = useRef<{ answers: Answers; progress: Progress }>({
    answers: start.answers,
    progress: { stepId: start.stepId ?? form.steps[0]!.id, furthestIndex: start.furthest },
  });
  const toast = useToast();

  // ...then, after mount, prefer a newer local backup (e.g. answers typed while offline).
  useEffect(() => {
    const local = readBackup(versionId);
    const serverAt = draft ? new Date(draft.updatedAt).getTime() : 0;
    if (local && local.savedAt > serverAt + 1000 && Object.keys(local.answers).length) {
      const next = {
        answers: local.answers,
        stepId: local.stepId,
        furthest: local.furthestIndex,
        restored: true,
      };
      setStart(next); // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
      setSeedKey(1);
      latest.current = {
        answers: next.answers,
        progress: { stepId: next.stepId, furthestIndex: next.furthest },
      };
      autosave.onProgress(next.answers, latest.current.progress); // push the offline answers to the server
      toast.show({ message: "Welcome back. We restored your answers from this device." });
    } else if (start.restored) toast.show({ message: "Welcome back. We restored your answers." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProgress = (answers: Answers, progress: Progress) => {
    latest.current = { answers, progress };
    autosave.onProgress(answers, progress);
  };

  const submit = async (answers: Answers): Promise<SubmitOutcome> => {
    const id = await autosave.flush({ answers, progress: latest.current.progress });
    if (!id)
      return {
        ok: false,
        message: navigator.onLine
          ? "Couldn't save your answers. Please try again."
          : "You're offline. Your answers are saved on this device; submit again when you're back online.",
      };
    const res = await fetch(`/api/responses/${id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      errors?: Record<string, string>;
      firstInvalidStepId?: string | null;
    };
    if (res.ok || res.status === 409) {
      clearBackup(versionId);
      return { ok: true };
    }
    if (res.status === 422)
      return {
        ok: false,
        errors: body.errors,
        firstInvalidStepId: body.firstInvalidStepId,
        message: body.error,
      };
    return { ok: false, message: body.error ?? "Couldn't submit. Please try again." };
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        {isDemo ? (
          <Badge tone="accent" className="self-start">
            Demo form
          </Badge>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
        {form.description ? <p className="text-fg-muted">{form.description}</p> : null}
      </header>

      <FormRunner
        key={`${seedKey}-${runKey}`}
        form={form}
        mode="live"
        initialAnswers={runKey === 0 ? start.answers : {}}
        initialStepId={runKey === 0 ? start.stepId : null}
        initialFurthestIndex={runKey === 0 ? start.furthest : 0}
        onProgress={onProgress}
        onSubmit={submit}
        onRestart={() => {
          autosave.reset();
          clearBackup(versionId);
          setRunKey((k) => k + 1);
        }}
        statusSlot={<SaveIndicator state={autosave.state} />}
        footerSlot={
          <Button variant="ghost" size="sm" onClick={() => setResumeOpen(true)}>
            Save and continue later
          </Button>
        }
      />

      <ResumeDialog
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        slug={slug}
        getId={() => autosave.flush(latest.current)}
      />
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    offline: "Offline · saved on this device",
    error: "Not saved · will retry",
  }[state];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-1.5",
        state === "offline" || state === "error" ? "text-danger" : "text-fg-muted",
      )}
    >
      {state === "saving" ? (
        <Spinner size="sm" />
      ) : state === "saved" ? (
        <Icon name="check" />
      ) : state === "offline" ? (
        <Icon name="wifiOff" />
      ) : null}
      {text}
    </span>
  );
}

function ResumeDialog({
  open,
  onClose,
  slug,
  getId,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  getId: () => Promise<string | null>;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLink(null);
      setError(null);
      const id = await getId();
      if (!id) return !cancelled && setError("Answer at least one question first, then try again.");
      const { data, error } = await createClient().rpc("issue_resume_token", { p_response_id: id });
      if (cancelled) return;
      if (error || !data) setError("Couldn't create a link. Please try again.");
      else setLink(`${window.location.origin}/f/${slug}/resume/${data as string}`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Continue later"
      description="Your answers are saved. Use this private link to pick up where you left off, on any device."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : link ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Resume link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              leadingIcon={<Icon name="copy" />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  toast.show({ message: "Link copied.", tone: "success" });
                } catch {
                  toast.show({
                    message: "Couldn't copy. Select the link and copy it.",
                    tone: "danger",
                  });
                }
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-sm text-fg-muted">
            Keep it private: anyone with the link can continue your response. It works once and
            expires in 30 days. Opening it moves your answers to that device.
          </p>
        </div>
      ) : (
        <Spinner label="Creating your link" />
      )}
    </Dialog>
  );
}
