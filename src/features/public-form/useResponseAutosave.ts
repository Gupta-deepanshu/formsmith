"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Answers } from "@/core";
import type { Progress } from "@/components/form-renderer/FormRunner";
import { createClient, ensureSession } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Respondent autosave.
 *  - Every change is written to localStorage immediately, so a refresh or crash never
 *    loses answers, even offline.
 *  - The server copy is saved after a 1s pause. The draft row is created lazily on the
 *    first change, so bounce visits don't create empty responses (and the funnel's
 *    "started" means "answered something").
 *  - Saves are serialised; changes made during a save trigger one more save.
 */

export type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

type LocalBackup = { answers: Answers; stepId: string; furthestIndex: number; savedAt: number };
const backupKey = (versionId: string) => `formsmith:answers:${versionId}`;

export function readBackup(versionId: string): LocalBackup | null {
  try {
    const raw = localStorage.getItem(backupKey(versionId));
    return raw ? (JSON.parse(raw) as LocalBackup) : null;
  } catch {
    return null;
  }
}
export function clearBackup(versionId: string) {
  try {
    localStorage.removeItem(backupKey(versionId));
  } catch {
    // ignore
  }
}

const DEBOUNCE_MS = 1000;

export function useResponseAutosave({
  versionId,
  initialResponseId,
}: {
  versionId: string;
  initialResponseId: string | null;
}) {
  const [state, setState] = useState<SaveState>(initialResponseId ? "saved" : "idle");
  const responseId = useRef<string | null>(initialResponseId);
  const pending = useRef<{ answers: Answers; progress: Progress } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** One worker loop drains the queue; concurrent callers await the same run. */
  const saveNow = useCallback(async (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      while (pending.current) {
        if (!navigator.onLine) {
          setState("offline");
          return;
        }
        const job = pending.current;
        pending.current = null;
        setState("saving");
        try {
          await ensureSession();
          const supabase = createClient();
          const row = {
            answers: job.answers as Json,
            last_step_id: job.progress.stepId,
            furthest_step_index: Math.min(100, job.progress.furthestIndex),
          };
          if (!responseId.current) {
            const { data, error } = await supabase
              .from("responses")
              .insert({ version_id: versionId, ...row })
              .select("id")
              .single();
            if (error?.code === "23505") {
              // A draft already exists for this session (e.g. another tab): adopt it.
              const { data: existing } = await supabase
                .from("responses")
                .select("id")
                .eq("version_id", versionId)
                .eq("status", "draft")
                .maybeSingle();
              if (!existing) throw error;
              responseId.current = existing.id;
              const { error: e2 } = await supabase
                .from("responses")
                .update(row)
                .eq("id", existing.id);
              if (e2) throw e2;
            } else if (error || !data) throw error ?? new Error("insert failed");
            else responseId.current = data.id;
          } else {
            const { error } = await supabase
              .from("responses")
              .update(row)
              .eq("id", responseId.current);
            if (error) throw error;
          }
        } catch {
          // Re-queue (unless newer answers arrived) so the next change or reconnect retries.
          pending.current ??= job;
          setState(navigator.onLine ? "error" : "offline");
          return;
        }
      }
      setState("saved");
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [versionId]);

  const onProgress = useCallback(
    (answers: Answers, progress: Progress) => {
      try {
        localStorage.setItem(
          backupKey(versionId),
          JSON.stringify({
            answers,
            stepId: progress.stepId,
            furthestIndex: progress.furthestIndex,
            savedAt: Date.now(),
          } satisfies LocalBackup),
        );
      } catch {
        // storage blocked: server autosave still works
      }
      pending.current = { answers, progress };
      if (!navigator.onLine) {
        setState("offline");
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNow(), DEBOUNCE_MS);
    },
    [versionId, saveNow],
  );

  useEffect(() => {
    const onOnline = () => void saveNow();
    const onOffline = () => setState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveNow]);

  /** Save immediately (used before submit / resume-link) and return the response id. */
  const flush = useCallback(
    async (fallback?: { answers: Answers; progress: Progress }): Promise<string | null> => {
      if (timer.current) clearTimeout(timer.current);
      if (!pending.current && !responseId.current && fallback) pending.current = fallback;
      await saveNow();
      return responseId.current;
    },
    [saveNow],
  );

  const reset = useCallback(() => {
    responseId.current = null;
    pending.current = null;
    setState("idle");
  }, []);

  return { state, onProgress, flush, reset, getResponseId: () => responseId.current };
}
