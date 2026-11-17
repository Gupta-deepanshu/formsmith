"use client";

import { useEffect, useState } from "react";
import { Button, Card, useToast } from "@/components/ui";
import type { FormDefinition } from "@/core";
import { createForm } from "@/features/forms/mutations";
import { clearSandbox, readSandbox } from "@/features/editor/sandboxStorage";

/** If the visitor built something in the sandbox before signing in, offer to keep it. */
export function SandboxImport({ onImported }: { onImported: (id: string) => void }) {
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  // localStorage is only available after mount; reading it in render would break hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
    setForm(readSandbox());
  }, []);

  if (!form) return null;

  const importIt = async () => {
    setPending(true);
    try {
      const { id } = await createForm(form);
      clearSandbox();
      onImported(id);
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" });
      setPending(false);
    }
  };

  return (
    <Card className="mb-4 flex flex-col gap-3 border-accent bg-accent-soft sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">
        You have a form from the sandbox editor: <strong>{form.title}</strong>. Save it to your account?
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearSandbox();
            setForm(null);
          }}
        >
          Discard
        </Button>
        <Button size="sm" variant="primary" onClick={importIt} loading={pending}>
          Save to my forms
        </Button>
      </div>
    </Card>
  );
}
