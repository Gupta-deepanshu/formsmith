import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { loadForm } from "@/core";
import { PublicForm, type PublicDraft } from "@/features/public-form/PublicForm";
import { createClient } from "@/lib/supabase/server";
import { PublicShell } from "@/features/public-form/PublicShell";

export const metadata: Metadata = { title: "Form", robots: { index: false } };

type Opened = { formId: string; slug: string; isDemo: boolean; versionId: string; version: number; schema: unknown; draft: PublicDraft | null };

/** Public form. Reads the session (to resume a draft) and params, so it streams behind Suspense. */
export default function PublicFormPage({ params }: PageProps<"/f/[slug]">) {
  return (
    <PublicShell>
      <Suspense fallback={<FormSkeleton />}>
        <PublicFormData params={params} />
      </Suspense>
    </PublicShell>
  );
}

async function PublicFormData({ params }: { params: PageProps<"/f/[slug]">["params"] }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,63}$/.test(slug)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_public_form", { p_slug: slug });
  const opened = data as unknown as Opened | null;
  if (!opened) notFound();

  const loaded = loadForm(opened.schema);
  if (!loaded.ok) {
    return (
      <Card className="text-center">
        <h1 className="text-lg font-semibold">This form is unavailable</h1>
        <p className="mt-1 text-sm text-fg-muted">The owner needs to fix and republish it.</p>
      </Card>
    );
  }
  return <PublicForm slug={opened.slug} versionId={opened.versionId} isDemo={opened.isDemo} form={loaded.form} draft={opened.draft} />;
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading form">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  );
}
