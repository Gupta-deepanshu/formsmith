"use client";

import { useCallback } from "react";
import type { FormDefinition, ResponseRecord } from "@/core";
import { Summary } from "./ResponsesDashboard";

/** Same Summary the owner sees, fed with the anonymised demo rows. */
export function DemoSummary({ form, responses }: { form: FormDefinition; responses: ResponseRecord[] }) {
  const formFor = useCallback(() => form, [form]);
  if (!responses.length) return <p className="text-fg-muted">No responses yet. Be the first!</p>;
  return <Summary base={form} fields={form.steps.flatMap((s) => s.fields)} responses={responses} formFor={formFor} />;
}
