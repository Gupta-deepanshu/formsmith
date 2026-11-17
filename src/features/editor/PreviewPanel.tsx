"use client";

import { useMemo, useState } from "react";
import { Button, Icon } from "@/components/ui";
import { FormRunner } from "@/components/form-renderer/FormRunner";
import { selectFormDefinition, useEditor, useEditorActions } from "./store";

const EMPTY = new Set<string>();

/** Live, interactive preview of the draft. Follows the selected step; answers are in-memory only. */
export function PreviewPanel() {
  const form = useEditor(selectFormDefinition);
  const previewStepId = useEditor((s) => s.previewStepId);
  const aiFieldIds = useEditor((s) => s.aiHighlight?.fieldIds);
  const { setPreviewStep } = useEditorActions();
  const [resetKey, setResetKey] = useState(0);
  const highlight = useMemo(() => (aiFieldIds ? new Set(aiFieldIds) : EMPTY), [aiFieldIds]);

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="preview-heading" className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
          Live preview
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setResetKey((k) => k + 1)} leadingIcon={<Icon name="undo" />}>
          Reset answers
        </Button>
      </div>
      <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6">
        <header className="mb-6 border-b border-line pb-4">
          <p className="text-lg font-semibold">{form.title || "Untitled form"}</p>
          {form.description ? <p className="mt-1 text-sm text-fg-muted">{form.description}</p> : null}
        </header>
        <FormRunner
          key={resetKey}
          form={form}
          mode="preview"
          stepId={previewStepId ?? undefined}
          onStepChange={setPreviewStep}
          onSubmit={async () => ({ ok: true })}
          onRestart={() => setResetKey((k) => k + 1)}
          highlightFieldIds={highlight}
        />
      </div>
    </section>
  );
}
