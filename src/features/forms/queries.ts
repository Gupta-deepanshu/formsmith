import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

/** Server-side reads for owner pages. RLS scopes every query to the signed-in owner. */

export type FormSummary = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  hasUnpublishedChanges: boolean;
  publishedVersion: number | null;
  responseCount: number;
  updatedAt: string;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
  published_version_id: string | null;
  published: { version: number; published_at: string } | null;
};

export async function listMyForms(): Promise<FormSummary[]> {
  const supabase = await createClient();
  // Counts come from a SECURITY INVOKER function, not an embedded `responses(count)`:
  // PostgREST aggregates need table-level SELECT on responses, which clients deliberately
  // don't have (column grants keep resume_token_hash unreadable). Both run in parallel.
  const [forms, counts] = await Promise.all([
    supabase
      .from("forms")
      .select(
        "id, slug, title, updated_at, published_version_id, published:form_versions!forms_published_version_fk(version, published_at)",
      )
      .order("updated_at", { ascending: false }),
    supabase.rpc("my_form_response_counts"),
  ]);
  if (forms.error || counts.error) throw new Error("Couldn't load your forms");
  const countByForm = new Map(counts.data.map((c) => [c.form_id, Number(c.submitted)]));
  return (forms.data as unknown as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.published_version_id ? "published" : "draft",
    // The draft changed after the live version was cut (allow 2s for the publish write itself).
    hasUnpublishedChanges:
      !!r.published &&
      new Date(r.updated_at).getTime() - new Date(r.published.published_at).getTime() > 2000,
    publishedVersion: r.published?.version ?? null,
    responseCount: countByForm.get(r.id) ?? 0,
    updatedAt: r.updated_at,
  }));
}

export type FormForEdit = {
  id: string;
  slug: string;
  title: string;
  draftSchema: Json;
  publishedVersion: number | null;
  publishedAt: string | null;
  publishedSchema: Json | null;
  updatedAt: string;
};

export async function getFormForEdit(id: string): Promise<FormForEdit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select(
      "id, slug, title, draft_schema, updated_at, published:form_versions!forms_published_version_fk(version, published_at, schema)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    slug: string;
    title: string;
    draft_schema: Json;
    updated_at: string;
    published: { version: number; published_at: string; schema: Json } | null;
  };
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    draftSchema: row.draft_schema,
    publishedVersion: row.published?.version ?? null,
    publishedAt: row.published?.published_at ?? null,
    publishedSchema: row.published?.schema ?? null,
    updatedAt: row.updated_at,
  };
}
