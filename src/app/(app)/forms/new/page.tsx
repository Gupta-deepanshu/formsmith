import type { Metadata } from "next";
import { NewFormClient } from "@/features/ai-create/NewFormClient";

export const metadata: Metadata = { title: "New form" };

export default function NewFormPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">New form</h1>
      <p className="mb-6 text-fg-muted">
        Describe it in plain English. You can change everything afterwards.
      </p>
      <NewFormClient />
    </main>
  );
}
