"use client";

import { useEffect, useRef } from "react";
import type { FormDefinition } from "@/core";
import { saveDraft } from "@/features/forms/mutations";
import { writeSandbox } from "./sandboxStorage";
import { selectFormDefinition, useEditorStore } from "./store";

/**
 * Where the editor saves. The editor depends only on this interface, so the same editor
 * runs signed-in (Supabase) and in the sandbox (localStorage) without knowing which.
 */
export type DraftPersistence = {
  kind: "remote" | "local";
  save: (form: FormDefinition) => Promise<{ savedAt: string }>;
};

export const supabasePersistence = (formId: string): DraftPersistence => ({
  kind: "remote",
  save: async (form) => {
    const { updatedAt } = await saveDraft(formId, form);
    return { savedAt: updatedAt };
  },
});

export const localPersistence: DraftPersistence = {
  kind: "local",
  save: async (form) => {
    if (!writeSandbox(form))
      throw new Error("Your browser blocked local storage, so changes won't survive a refresh.");
    return { savedAt: new Date().toISOString() };
  },
};

const DEBOUNCE_MS = 800;

/**
 * Debounced autosave. Saves the latest revision after typing pauses, never runs two saves
 * at once, retries when the browser comes back online, and warns before closing the tab
 * with unsaved changes.
 */
export function useAutosave(persistence: DraftPersistence) {
  const store = useEditorStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const flush = async () => {
      const s = store.getState();
      if (inFlight.current || s.revision === s.savedRevision) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        s.actions.markSaveFailed(
          "offline",
          "You're offline. Changes will save when you reconnect.",
        );
        return;
      }
      inFlight.current = true;
      const revision = s.revision;
      s.actions.markSaving();
      try {
        const { savedAt } = await persistence.save(selectFormDefinition(s));
        store.getState().actions.markSaved(revision, savedAt);
      } catch (e) {
        store
          .getState()
          .actions.markSaveFailed(navigator.onLine ? "error" : "offline", (e as Error).message);
      } finally {
        inFlight.current = false;
        // Changes made while saving: save again.
        const after = store.getState();
        if (after.revision !== after.savedRevision && after.save.status === "saved") schedule();
      }
    };
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const unsub = store.subscribe((s, prev) => {
      if (s.revision !== prev.revision) schedule();
    });
    const onOnline = () => schedule();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = store.getState();
      if (s.revision !== s.savedRevision) e.preventDefault();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [store, persistence]);
}
