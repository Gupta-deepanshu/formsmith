"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { jobApplicationForm, type FormDefinition } from "@/core";
import { Editor } from "./EditorShell";
import { localPersistence } from "./persistence";
import { clearSandbox, readSandbox } from "./sandboxStorage";

/**
 * "Try the editor" without signing in: the same Editor with a localStorage persistence
 * adapter. Publishing is preview-only; RLS bars anonymous users from the forms table, so
 * nothing here can reach the database even if the client were tampered with.
 */
export function SandboxEditor() {
  // localStorage only exists in the browser, so load after mount (avoids a hydration mismatch).
  const [initial, setInitial] = useState<FormDefinition | null>(null);
  const [instance, setInstance] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
    setInitial(readSandbox() ?? jobApplicationForm());
  }, []);

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
    <Editor
      key={instance}
      init={{ form: initial }}
      persistence={localPersistence}
      mode={{
        kind: "sandbox",
        onReset: () => {
          clearSandbox();
          setInitial(jobApplicationForm());
          setInstance((i) => i + 1);
        },
      }}
    />
  );
}
