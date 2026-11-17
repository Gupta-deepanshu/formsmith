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
  responses: { count: number }[];
};

export async function listMyForms(): Promise<FormSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select("id, slug, title, updated_at, published_version_id, published:form_versions!forms_published_version_fk(version, published_at), responses(count)")
    .eq("responses.status", "submitted")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Couldn't load your forms");
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.published_version_id ? "published" : "draft",
    // The draft changed after the live version was cut (allow 2s for the publish write itself).
    hasUnpublishedChanges: !!r.published && new Date(r.updated_at).getTime() - new Date(r.published.published_at).getTime() > 2000,
    publishedVersion: r.published?.version ?? null,
    responseCount: r.responses[0]?.count ?? 0,
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
  updatedAt: string;
};

export async function getFormForEdit(id: string): Promise<FormForEdit | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select("id, slug, title, draft_schema, updated_at, published:form_versions!forms_published_version_fk(version, published_at)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { id: string; slug: string; title: string; draft_schema: Json; updated_at: string; published: { version: number; published_at: string } | null };
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    draftSchema: row.draft_schema,
    publishedVersion: row.published?.version ?? null,
    publishedAt: row.published?.published_at ?? null,
    updatedAt: row.updated_at,
  };
}
