import { z } from "zod";
import { AnswersSchema, loadForm, validateSubmission, type Answers } from "@/core";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Submit a response. Never trusts the client:
 *  1. The caller must own the draft (checked through RLS with their own session).
 *  2. Answers are merged with the stored draft and re-validated with the SAME core validator
 *     the browser used, against the response's OWN published version (so a re-publish
 *     mid-flow doesn't change the rules under the respondent).
 *  3. Only then is it marked submitted. That needs the secret key, because no client role
 *     may write status/submitted_at (see docs/PLAN.md §5a).
 */
const MAX_BODY = 140_000;
const Body = z.object({ answers: AnswersSchema });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function POST(request: Request, ctx: RouteContext<"/api/responses/[id]/submit">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return Response.json({ error: "Your session expired. Refresh the page and try again." }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "Your answers are too long." }, { status: 413 });
  let parsedBody: z.infer<typeof Body>;
  try {
    const r = Body.safeParse(JSON.parse(raw));
    if (!r.success) return Response.json({ error: "Invalid answers." }, { status: 400 });
    parsedBody = r.data;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // 1. Ownership via RLS: this select only returns the row if it's the caller's own response.
  const { data: response } = await supabase.from("responses").select("id, version_id, status, answers, respondent_id").eq("id", id).maybeSingle();
  if (!response || response.respondent_id !== uid) return Response.json({ error: "Not found" }, { status: 404 });
  if (response.status !== "draft") return Response.json({ error: "This response was already submitted." }, { status: 409 });

  // 2. The response's own version. Respondents can't read form_versions, so the admin client fetches it.
  const admin = createAdminClient();
  const { data: version } = await admin.from("form_versions").select("schema").eq("id", response.version_id).single();
  const loaded = version ? loadForm(version.schema) : null;
  if (!loaded?.ok) return Response.json({ error: "This form is unavailable." }, { status: 410 });

  const merged: Answers = { ...((response.answers ?? {}) as Answers), ...parsedBody.answers };
  const result = validateSubmission(loaded.form, merged);
  if (!result.success) {
    return Response.json({ error: "Some answers need attention.", errors: result.errors, firstInvalidStepId: result.firstInvalidStepId }, { status: 422 });
  }

  // 3. Mark submitted. The status guard makes double-submits a no-op (409), not a second write.
  const { data: updated, error } = await admin
    .from("responses")
    .update({ answers: result.data as Json, status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("respondent_id", uid)
    .eq("status", "draft")
    .select("id");
  if (error) return Response.json({ error: "Couldn't submit. Please try again." }, { status: 500 });
  if (!updated?.length) return Response.json({ error: "This response was already submitted." }, { status: 409 });

  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
