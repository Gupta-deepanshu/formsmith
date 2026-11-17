// Access-rule checks against the LINKED Supabase project: RLS policies, column grants and
// SQL functions, exercised as real users. Re-run after every migration:
//
//   pnpm check:rls
//
// Creates its own temporary users (two owners, three anonymous respondents) and deletes them
// at the end, even on failure; their forms and responses cascade away with them. Never
// touches the demo form's data (it only reads its schema to use as a test form) and never
// prints keys. Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
// SUPABASE_SECRET_KEY in .env.local, plus anonymous sign-ins enabled in the dashboard.
//
// Plain Node ESM (node --env-file) so it needs no extra dependencies or a running app.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) {
  console.error("Missing Supabase env vars (see .env.example).");
  process.exit(2);
}
if (/\/rest\/v1\/?$/.test(URL_)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL must be the bare project URL, without /rest/v1.");
  process.exit(2);
}

const DEMO_FORM_ID = "00000000-0000-4000-8000-000000000001";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SECRET, opts);
const client = () => createClient(URL_, PUB, opts);
const tag = randomBytes(4).toString("hex");

let passed = 0;
const failures = [];
function check(name, ok, info) {
  if (ok) passed++;
  else failures.push(name);
  const detail = !ok && info !== undefined ? `  -> ${String(info).slice(0, 200)}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail}`);
}
/** Denied = an error, or (for RLS-filtered reads/writes) no rows touched. */
const denied = (r) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);
const errored = (r) => !!r.error;

const users = [];

async function owner(label) {
  const email = `formsmith-rls-${tag}-${label}@example.com`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw new Error(`create ${label}: ${created.error.message}`);
  users.push(created.data.user.id);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const sb = client();
  const v = await sb.auth.verifyOtp({
    token_hash: link.data?.properties?.hashed_token,
    type: "magiclink",
  });
  if (v.error) throw new Error(`sign in ${label}: ${v.error.message}`);
  return { sb, id: created.data.user.id };
}

async function anonymous(label) {
  const sb = client();
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(`anonymous sign-in (${label}): ${error.message}`);
  users.push(data.user.id);
  return { sb, id: data.user.id };
}

async function main() {
  // ------------------------------------------------------------------ signed out
  const anon = client();
  check("signed out: forms not readable", denied(await anon.from("forms").select("id")));
  check("signed out: responses not readable", denied(await anon.from("responses").select("id")));
  check(
    "signed out: ai_requests not readable",
    denied(await anon.from("ai_requests").select("id")),
  );
  const demo = await anon.rpc("open_public_form", { p_slug: "demo" });
  check(
    "signed out: open_public_form('demo') works",
    !demo.error && demo.data?.isDemo === true,
    demo.error?.message,
  );
  const stats = await anon.rpc("get_demo_responses");
  const row = stats.data?.responses?.[0];
  check(
    "signed out: get_demo_responses works",
    !stats.error && Array.isArray(stats.data?.responses),
    stats.error?.message,
  );
  check(
    "demo stats expose no ids or timestamps",
    !row || !["id", "started_at", "submitted_at", "respondent_id"].some((k) => k in row),
    JSON.stringify(row),
  );
  check(
    "signed out: consume_ai_quota denied",
    errored(await anon.rpc("consume_ai_quota", { p_kind: "generate" })),
  );
  check(
    "signed out: publish_form denied",
    errored(await anon.rpc("publish_form", { p_form_id: DEMO_FORM_ID })),
  );
  check(
    "signed out: my_form_response_counts denied",
    errored(await anon.rpc("my_form_response_counts")),
  );

  const schema = demo.data?.schema;
  if (!schema) throw new Error("demo schema unavailable; cannot build a test form");

  // ------------------------------------------------------------------ owners
  const a = await owner("a");
  const b = await owner("b");
  const slug = `rls-${tag}`;
  const ins = await a.sb
    .from("forms")
    .insert({ slug, title: "RLS check form", draft_schema: schema })
    .select("id, owner_id")
    .single();
  check(
    "owner creates a form (owner_id = self)",
    !ins.error && ins.data?.owner_id === a.id,
    ins.error?.message,
  );
  const formId = ins.data?.id;
  check(
    "owner cannot set is_demo",
    errored(
      await a.sb
        .from("forms")
        .insert({ slug: `${slug}-d`, title: "x", draft_schema: schema, is_demo: true }),
    ),
  );
  check(
    "owner cannot set owner_id on insert",
    errored(
      await a.sb
        .from("forms")
        .insert({ slug: `${slug}-o`, title: "x", draft_schema: schema, owner_id: b.id }),
    ),
  );
  check(
    "owner cannot reassign owner_id",
    errored(await a.sb.from("forms").update({ owner_id: b.id }).eq("id", formId)),
  );
  check(
    "owner cannot set published_version_id directly",
    errored(await a.sb.from("forms").update({ published_version_id: null }).eq("id", formId)),
  );
  check(
    "owner cannot insert form_versions",
    errored(await a.sb.from("form_versions").insert({ form_id: formId, version: 1, schema })),
  );
  check(
    "other owner cannot read the form",
    denied(await b.sb.from("forms").select("id").eq("id", formId)),
  );
  check(
    "other owner cannot update the form",
    denied(await b.sb.from("forms").update({ title: "hijack" }).eq("id", formId).select("id")),
  );
  check(
    "other owner cannot delete the form",
    denied(await b.sb.from("forms").delete().eq("id", formId).select("id")),
  );
  check(
    "other owner cannot publish the form",
    errored(await b.sb.rpc("publish_form", { p_form_id: formId })),
  );
  check(
    "owner cannot read the demo form row",
    denied(await a.sb.from("forms").select("id").eq("id", DEMO_FORM_ID)),
  );

  const p1 = await a.sb.rpc("publish_form", { p_form_id: formId });
  check("publish_form creates version 1", !p1.error && p1.data?.version === 1, p1.error?.message);
  const v1 = p1.data?.versionId;
  check(
    "form_versions are immutable",
    denied(await a.sb.from("form_versions").update({ schema: {} }).eq("id", v1).select("id")),
  );
  check(
    "form_versions cannot be deleted",
    denied(await a.sb.from("form_versions").delete().eq("id", v1).select("id")),
  );
  check(
    "other owner cannot read the versions",
    denied(await b.sb.from("form_versions").select("id").eq("form_id", formId)),
  );

  // ------------------------------------------------------------------ respondents
  const r1 = await anonymous("r1");
  const r2 = await anonymous("r2");
  check(
    "anonymous user cannot create forms",
    errored(
      await r1.sb.from("forms").insert({ slug: `${slug}-a`, title: "x", draft_schema: schema }),
    ),
  );
  check("anonymous user cannot read forms", denied(await r1.sb.from("forms").select("id")));
  check(
    "anonymous user cannot read form_versions",
    denied(await r1.sb.from("form_versions").select("id")),
  );
  check(
    "anonymous user cannot publish",
    errored(await r1.sb.rpc("publish_form", { p_form_id: formId })),
  );
  const open = await r1.sb.rpc("open_public_form", { p_slug: slug });
  check(
    "respondent opens the published form",
    !open.error && open.data?.versionId === v1,
    open.error?.message,
  );

  const draft = await r1.sb
    .from("responses")
    .insert({ version_id: v1, answers: {}, furthest_step_index: 0 })
    .select("id, form_id, respondent_id, status")
    .single();
  check(
    "respondent starts a draft (form_id and respondent_id set server-side)",
    !draft.error &&
      draft.data?.form_id === formId &&
      draft.data?.respondent_id === r1.id &&
      draft.data?.status === "draft",
    draft.error?.message,
  );
  const respId = draft.data?.id;
  check(
    "respondent cannot insert as someone else",
    errored(
      await r2.sb.from("responses").insert({ version_id: v1, answers: {}, respondent_id: r1.id }),
    ),
  );
  check(
    "respondent cannot insert a submitted response",
    errored(
      await r2.sb.from("responses").insert({ version_id: v1, answers: {}, status: "submitted" }),
    ),
  );
  check(
    "respondent cannot pick form_id",
    errored(
      await r2.sb.from("responses").insert({ version_id: v1, answers: {}, form_id: DEMO_FORM_ID }),
    ),
  );
  check(
    "respondent autosaves own draft",
    !denied(
      await r1.sb
        .from("responses")
        .update({ answers: { f_name: "Test" }, furthest_step_index: 1 })
        .eq("id", respId)
        .select("id"),
    ),
  );
  check(
    "respondent cannot set status",
    errored(await r1.sb.from("responses").update({ status: "submitted" }).eq("id", respId)),
  );
  check(
    "respondent cannot set submitted_at",
    errored(
      await r1.sb
        .from("responses")
        .update({ submitted_at: new Date().toISOString() })
        .eq("id", respId),
    ),
  );
  check(
    "respondent cannot move a draft to another version",
    errored(await r1.sb.from("responses").update({ version_id: v1 }).eq("id", respId)),
  );
  check(
    "respondent cannot read resume_token_hash",
    errored(await r1.sb.from("responses").select("resume_token_hash").eq("id", respId)),
  );
  check(
    "select * on responses is denied",
    errored(await r1.sb.from("responses").select("*").eq("id", respId)),
  );
  check(
    "respondent cannot delete responses",
    denied(await r1.sb.from("responses").delete().eq("id", respId).select("id")),
  );
  check(
    "other respondent cannot read the draft",
    denied(await r2.sb.from("responses").select("id").eq("id", respId)),
  );
  check(
    "other respondent cannot update the draft",
    denied(await r2.sb.from("responses").update({ answers: {} }).eq("id", respId).select("id")),
  );
  const dup = await r1.sb
    .from("responses")
    .insert({ version_id: v1, answers: {}, furthest_step_index: 0 });
  check("one open draft per respondent per version", dup.error?.code === "23505", dup.error?.code);
  check(
    "respondent cannot write ai_requests",
    errored(
      await r1.sb.from("ai_requests").insert({ user_id: r1.id, is_anonymous: true, kind: "edit" }),
    ),
  );

  check(
    "owner reads responses to own form",
    !denied(await a.sb.from("responses").select("id").eq("form_id", formId)),
  );
  check(
    "other owner cannot read those responses",
    denied(await b.sb.from("responses").select("id").eq("form_id", formId)),
  );
  check(
    "owner cannot read resume_token_hash",
    errored(await a.sb.from("responses").select("resume_token_hash").eq("form_id", formId)),
  );
  check(
    "owner cannot edit a respondent's answers",
    denied(await a.sb.from("responses").update({ answers: {} }).eq("id", respId).select("id")),
  );
  check(
    "owner cannot read demo responses directly",
    denied(await a.sb.from("responses").select("id").eq("form_id", DEMO_FORM_ID)),
  );

  // ------------------------------------------------------------------ resume tokens
  check(
    "other respondent cannot issue a token for the draft",
    errored(await r2.sb.rpc("issue_resume_token", { p_response_id: respId })),
  );
  const tok = await r1.sb.rpc("issue_resume_token", { p_response_id: respId });
  check(
    "issue_resume_token returns a 43-char token",
    !tok.error && tok.data?.length === 43,
    tok.error?.message,
  );
  const stored = await admin
    .from("responses")
    .select("resume_token_hash, resume_token_expires_at")
    .eq("id", respId)
    .single();
  const days = (new Date(stored.data?.resume_token_expires_at).getTime() - Date.now()) / 864e5;
  check(
    "only the hash is stored; expiry is 30 days",
    !!stored.data?.resume_token_hash &&
      !String(stored.data.resume_token_hash).includes(tok.data) &&
      days > 29.9 &&
      days < 30.1,
    days,
  );
  const wrong = await r2.sb.rpc("claim_response", { p_token: "x".repeat(43) });
  check("a wrong token claims nothing", !wrong.error && wrong.data === null, wrong.error?.message);
  const claim = await r2.sb.rpc("claim_response", { p_token: tok.data });
  check(
    "second device claims the draft",
    !claim.error && claim.data?.responseId === respId,
    claim.error?.message,
  );
  check(
    "first device loses the draft",
    denied(await r1.sb.from("responses").select("id").eq("id", respId)),
  );
  const reuse = await r1.sb.rpc("claim_response", { p_token: tok.data });
  check("token is single-use", !reuse.error && reuse.data === null, reuse.error?.message);

  // ------------------------------------------------------------------ versions on re-publish
  await a.sb.from("forms").update({ title: "RLS check form v2" }).eq("id", formId);
  const p2 = await a.sb.rpc("publish_form", { p_form_id: formId });
  check("re-publish creates version 2", p2.data?.version === 2, p2.error?.message);
  const keep = await r2.sb.rpc("open_public_form", { p_slug: slug });
  check(
    "in-progress draft stays on its version",
    keep.data?.versionId === v1 && keep.data?.draft?.id === respId,
  );
  const r3 = await anonymous("r3");
  check(
    "new drafts can't start on a superseded version",
    errored(await r3.sb.from("responses").insert({ version_id: v1, answers: {} })),
  );

  // ------------------------------------------------------------------ submitted responses + counts
  // Marking submitted is the submit handler's job (secret key); simulate it here.
  await admin
    .from("responses")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", respId);
  check(
    "submitted response can't be edited by its respondent",
    denied(await r2.sb.from("responses").update({ answers: {} }).eq("id", respId).select("id")),
  );
  const counts = await a.sb.rpc("my_form_response_counts");
  check(
    "owner count = 1 for own form",
    !counts.error && counts.data.find((c) => c.form_id === formId)?.submitted === 1,
    JSON.stringify(counts.data ?? counts.error?.message),
  );
  const other = await b.sb.rpc("my_form_response_counts");
  check(
    "other owner gets no counts for it",
    !other.error && !other.data.some((c) => c.form_id === formId),
    JSON.stringify(other.data),
  );
  const resp = await r2.sb.rpc("my_form_response_counts");
  check(
    "respondent gets no counts for forms they only answered",
    !resp.error && resp.data.length === 0,
    JSON.stringify(resp.data),
  );

  // ------------------------------------------------------------------ AI quota
  const q = await r3.sb.rpc("consume_ai_quota", { p_kind: "edit" });
  check(
    "anonymous quota: allowed, 2 left",
    q.data?.allowed === true && q.data?.remaining === 2,
    JSON.stringify(q.data ?? q.error?.message),
  );
  await r3.sb.rpc("consume_ai_quota", { p_kind: "edit" });
  await r3.sb.rpc("consume_ai_quota", { p_kind: "edit" });
  const q4 = await r3.sb.rpc("consume_ai_quota", { p_kind: "edit" });
  check(
    "anonymous quota: 4th call refused",
    q4.data?.allowed === false && q4.data?.reason === "anonymous_limit",
    JSON.stringify(q4.data),
  );
  check(
    "quota rejects unknown kinds",
    errored(await r3.sb.rpc("consume_ai_quota", { p_kind: "other" })),
  );
  const oq = await a.sb.rpc("consume_ai_quota", { p_kind: "edit" });
  check(
    "owner quota: allowed, 19 left this hour",
    oq.data?.allowed === true && oq.data?.remaining === 19,
    JSON.stringify(oq.data),
  );
  const own = await a.sb.from("ai_requests").select("user_id");
  check(
    "users read only their own ai_requests",
    !own.error && own.data.length === 1 && own.data[0].user_id === a.id,
    JSON.stringify(own.data),
  );
  check(
    "finish_ai_request can't touch others' rows",
    !(
      await b.sb.rpc("finish_ai_request", {
        p_request_id: oq.data?.requestId,
        p_latency_ms: 1,
        p_valid: true,
        p_model: "x",
      })
    ).error &&
      (await admin.from("ai_requests").select("latency_ms").eq("id", oq.data?.requestId).single())
        .data?.latency_ms === null,
  );
}

try {
  await main();
} catch (e) {
  check("script error", false, e instanceof Error ? e.message : e);
} finally {
  let deleted = 0;
  for (const id of users) if (!(await admin.auth.admin.deleteUser(id)).error) deleted++;
  const leftForms = await admin.from("forms").select("id").like("slug", `rls-${tag}%`);
  const leftAi = users.length
    ? await admin.from("ai_requests").select("id").in("user_id", users)
    : { data: [] };
  // Responses by anonymous users are kept on user deletion by design (SET NULL), but these
  // belong to the test form, which cascades away with its owner.
  const leftResponses = formIdsGone(leftForms) ? 0 : "?";
  console.log(
    `\ncleanup: ${deleted}/${users.length} temporary users deleted; leftover forms ${leftForms.data?.length ?? "?"}, ai rows ${leftAi.data?.length ?? "?"}, responses ${leftResponses}`,
  );
  console.log(`${passed}/${passed + failures.length} checks passed`);
  process.exit(failures.length ? 1 : 0);
}

function formIdsGone(r) {
  return !r.error && r.data.length === 0;
}
