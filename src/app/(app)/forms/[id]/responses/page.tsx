import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { loadForm, type Answers, type ResponseRecord } from "@/core";
import { ResponsesDashboard, type VersionInfo } from "@/features/responses/ResponsesDashboard";
import { RESPONSE_COLUMNS } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Responses" };

const MAX_ROWS = 5000;

export default function ResponsesPage({ params }: PageProps<"/forms/[id]/responses">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded-card" />}>
        <ResponsesData params={params} />
      </Suspense>
    </main>
  );
}

async function ResponsesData({ params }: { params: PageProps<"/forms/[id]/responses">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  // RLS scopes all three queries to the owner.
  const [{ data: form }, { data: versions }, { data: rows }] = await Promise.all([
    supabase.from("forms").select("id, title, slug, published_version_id").eq("id", id).maybeSingle(),
    supabase.from("form_versions").select("id, version, schema, published_at").eq("form_id", id).order("version", { ascending: false }),
    supabase.from("responses").select(RESPONSE_COLUMNS).eq("form_id", id).order("started_at", { ascending: false }).limit(MAX_ROWS),
  ]);
  if (!form) notFound();

  const versionInfos: VersionInfo[] = (versions ?? []).flatMap((v) => {
    const loaded = loadForm(v.schema);
    return loaded.ok ? [{ id: v.id, version: v.version, publishedAt: v.published_at, form: loaded.form }] : [];
  });
  const responses: ResponseRecord[] = (rows ?? []).map((r) => ({
    id: r.id,
    versionId: r.version_id,
    status: r.status,
    answers: (r.answers ?? {}) as Answers,
    furthestStepIndex: r.furthest_step_index,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
  }));

  return <ResponsesDashboard title={form.title} formId={form.id} slug={form.slug} isPublished={!!form.published_version_id} versions={versionInfos} responses={responses} truncated={responses.length >= MAX_ROWS} />;
}
