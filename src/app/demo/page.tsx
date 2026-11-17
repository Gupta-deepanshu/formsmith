import type { Metadata } from "next";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { SiteHeader } from "@/components/SiteHeader";
import { buttonClasses, Skeleton } from "@/components/ui";
import { loadForm, type Answers, type ResponseRecord } from "@/core";
import { DemoSummary } from "@/features/responses/DemoSummary";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Demo results", description: "Live, anonymous totals for the Formsmith demo form." };

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Demo results</h1>
            <p className="text-fg-muted">Anonymous totals from everyone who filled in the demo form. Free-text answers are never shown.</p>
          </div>
          <Link href="/f/demo" className={buttonClasses({ variant: "primary" })}>
            Fill in the demo form
          </Link>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
          <DemoData />
        </Suspense>
      </main>
    </>
  );
}

async function DemoData() {
  const data = await getDemoStats();
  if (!data) return <p className="text-fg-muted">The demo form isn&apos;t set up yet.</p>;
  return <DemoSummary form={data.form} responses={data.responses} />;
}

type DemoPayload = { versionId: string | null; schema: unknown; responses: { status: "draft" | "submitted"; furthest_step_index: number; started_at: string; submitted_at: string | null; answers: Answers }[] };

/**
 * Public, identical for every visitor, so it's cached (Cache Components) and refreshed
 * every minute or so instead of hitting the database per visit. Uses a cookie-less client:
 * "use cache" scopes can't read cookies, and this data isn't user-specific anyway.
 */
async function getDemoStats() {
  "use cache";
  cacheLife("minutes");
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) return null;
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, { auth: { persistSession: false } });
  const { data } = await supabase.rpc("get_demo_responses");
  const payload = data as DemoPayload | null;
  if (!payload?.versionId) return null;
  const loaded = loadForm(payload.schema);
  if (!loaded.ok) return null;
  const responses: ResponseRecord[] = payload.responses.map((r, i) => ({
    id: String(i),
    versionId: payload.versionId!,
    status: r.status,
    answers: r.answers,
    furthestStepIndex: r.furthest_step_index,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
  }));
  return { form: loaded.form, responses };
}
