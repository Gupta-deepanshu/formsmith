"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Icon, Skeleton } from "@/components/ui";
import { jobApplicationForm, type FormDefinition } from "@/core";
import { GenerateForm } from "@/features/ai-create/GenerateForm";
import { Editor } from "./EditorShell";
import { localPersistence } from "./persistence";
import { clearSandbox, readSandbox, writeSandbox } from "./sandboxStorage";

/**
 * "Try the editor" without signing in: the same Editor with a localStorage persistence
 * adapter. Publishing is preview-only; RLS bars anonymous users from the forms table, so
 * nothing here can reach the database even if the client were tampered with.
 * AI calls use an anonymous session and are capped at 3 in total by consume_ai_quota.
 */
export function SandboxEditor() {
  // localStorage only exists in the browser, so load after mount (avoids a hydration mismatch).
  const [initial, setInitial] = useState<FormDefinition | null>(null);
  const [instance, setInstance] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
    setInitial(readSandbox() ?? jobApplicationForm());
  }, []);

  const replace = (form: FormDefinition) => {
    writeSandbox(form);
    setInitial(form);
    setInstance((i) => i + 1); // fresh editor (and history) for the new form
    setGenerating(false);
  };

  if (!initial) {
    return (
      <div className="mx-auto grid w-full max-w-[1600px] gap-6 p-4 lg:grid-cols-[300px_1fr_340px]" aria-busy="true" aria-label="Loading editor">
        <Skeleton className="h-96" />
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <>
      <Editor
        key={instance}
        init={{ form: initial }}
        persistence={localPersistence}
        mode={{
          kind: "sandbox",
          onReset: () => {
            clearSandbox();
            replace(jobApplicationForm());
          },
          extraActions: (
            <Button size="sm" onClick={() => setGenerating(true)} leadingIcon={<Icon name="sparkle" />}>
              Generate with AI
            </Button>
          ),
        }}
      />
      <Dialog open={generating} onClose={() => setGenerating(false)} size="lg" title="Generate a form with AI" description="Replaces the sandbox form. The sandbox allows 3 AI requests in total.">
        {generating ? <GenerateForm sandbox onUse={replace} /> : null}
      </Dialog>
    </>
  );
}
