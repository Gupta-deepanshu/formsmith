"use client";

import { validateForm, type FormDefinition } from "@/core";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import { makeSlug } from "@/lib/format";

/**
 * Owner mutations straight to Supabase under RLS: no API route needed. Each throws a
 * friendly Error on failure so optimistic UIs can roll back and toast it.
 */

const asJson = (form: FormDefinition) => form as unknown as Json;

export async function createForm(form: FormDefinition): Promise<{ id: string; slug: string }> {
  const supabase = createClient();
  // Retry once on the (very unlikely) slug collision.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = makeSlug(form.title);
    const { data, error } = await supabase.from("forms").insert({ slug, title: form.title, draft_schema: asJson(form) }).select("id, slug").single();
    if (!error && data) return data;
    if (error?.code !== "23505") break;
  }
  throw new Error("Couldn't create the form. Please try again.");
}

export async function saveDraft(id: string, form: FormDefinition): Promise<{ updatedAt: string }> {
  const { data, error } = await createClient().from("forms").update({ title: form.title.slice(0, 120) || "Untitled form", draft_schema: asJson(form) }).eq("id", id).select("updated_at").single();
  if (error || !data) throw new Error("Couldn't save your changes.");
  return { updatedAt: data.updated_at };
}

export async function deleteForm(id: string): Promise<void> {
  const { error, count } = await createClient().from("forms").delete({ count: "exact" }).eq("id", id);
  if (error || count === 0) throw new Error("Couldn't delete the form.");
}

export async function duplicateForm(id: string): Promise<{ id: string; slug: string; title: string; updatedAt: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("forms").select("title, draft_schema").eq("id", id).single();
  if (error || !data) throw new Error("Couldn't duplicate the form.");
  const def = { ...(data.draft_schema as unknown as FormDefinition), title: `${data.title} (copy)`.slice(0, 120) };
  const created = await createForm(def);
  return { ...created, title: def.title, updatedAt: new Date().toISOString() };
}

export type PublishResult = { versionId: string; version: number; slug: string };

/** Validate locally (errors block publish), save the draft, then snapshot it as a new immutable version. */
export async function publishForm(id: string, form: FormDefinition): Promise<PublishResult> {
  const check = validateForm(form);
  if (!check.ok) throw new Error(check.issues.find((i) => i.severity === "error")?.message ?? "Fix the errors before publishing.");
  await saveDraft(id, check.form);
  const { data, error } = await createClient().rpc("publish_form", { p_form_id: id });
  if (error || !data) throw new Error("Couldn't publish. Please try again.");
  return data as unknown as PublishResult;
}

export async function unpublishForm(id: string): Promise<void> {
  const { error } = await createClient().rpc("unpublish_form", { p_form_id: id });
  if (error) throw new Error("Couldn't unpublish.");
}
