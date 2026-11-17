"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui";
import type { FormDefinition } from "@/core";
import { createForm } from "@/features/forms/mutations";
import { GenerateForm } from "./GenerateForm";

export function NewFormClient() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const use = async (form: FormDefinition) => {
    setBusy(true);
    try {
      const { id } = await createForm(form);
      router.push(`/forms/${id}/edit`);
    } catch (e) {
      toast.show({ message: (e as Error).message, tone: "danger" });
      setBusy(false);
    }
  };

  return <GenerateForm onUse={use} busy={busy} />;
}
