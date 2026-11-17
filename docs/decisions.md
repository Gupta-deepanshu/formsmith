# Decision log

Short, defensible reasons for the non-obvious choices. Newest last.

## Architecture

- **Framework-free core (`src/core`).** Schema, rules, validation, patches, AI repair and analytics are pure TypeScript with no React/Next/Supabase imports (enforced by an ESLint rule). It's unit-testable in milliseconds and shared by browser and server, which is the point of the "same validator in both places" requirement.
- **Route Handlers for the three server pieces, not Server Actions.** Generate must stream. Explicit HTTP status codes (401/409/413/422/429/503) map onto UI states. Everything else (CRUD, autosave) goes straight to Supabase under RLS, so there's no custom backend.
- **SQL functions instead of a backend.** Publishing, the public form read, resume claims, the AI quota and the demo stats are narrow `security definer` functions with `search_path = ''`. Each does its own authorisation. Called with the user's own session.

## Data & security

- **RLS + column grants.** RLS decides _which rows_; column grants decide _which columns_. Respondents can update only `answers/last_step_id/furthest_step_index`, so they can never set `status`. Nobody can select `resume_token_hash`. Consequence: clients must list columns explicitly (`RESPONSE_COLUMNS`); `select *` fails by design.
- **Secret key in exactly one handler.** `src/lib/supabase/admin.ts` (`server-only`) is imported only by the submit handler. There it (1) reads the response's version schema (respondents can't read `form_versions`) and (2) sets `status = submitted` after the shared validator passes. A Postgres policy can't run our TypeScript validator, so this transition can't be left to RLS.
- **`responses.respondent_id` is nullable, `on delete set null`.** Supabase recommends periodically deleting old anonymous users; that must not delete their submitted responses.
- **`responses.form_id` denormalised (trigger-filled).** Owner RLS becomes one indexed lookup, and analytics can span versions.
- **Funnel = furthest step on the respondent's own path.** `furthest_step_index` plus re-running the rule engine on their answers counts conditional steps only for people who were shown them.
- **Resume tokens:** 32 random bytes, returned once, stored as SHA-256, 30-day expiry, single use. Claiming moves the draft to the claiming session (single device). A leaked DB or an owner reading responses can't hijack drafts.
- **Drafts are created lazily** (first answer), so "started" in the funnel means "answered something", and bounce visits don't create rows.
- **Demo form is owner-less (`is_demo`).** Its public stats come from a function that returns only choice-type answers, never free text.

## Schema & editing

- **Discriminated union per field type.** Invalid combinations (`min` on an email) can't be expressed.
- **Option ids in answers, not labels.** Renaming an option never corrupts data or rules.
- **Rules may only reference earlier fields.** Evaluation is one ordered pass and cycles are structurally impossible. The analyser still runs DFS cycle detection so a reorder that creates a loop gets a message naming it.
- **Hidden fields read as empty for later rules** (cascading hide), and their answers are pruned before validation/submit.
- **Domain patch ops keyed by id, not JSON Patch.** Index paths break on reorder and are hard for an LLM to get right. Id-keyed ops validate one by one and compute their own inverse at apply time. The same format is the undo log and the AI's output.
- **Patches apply to a normalised form with structural sharing.** An `updateField` replaces exactly one object, so Zustand selectors for other fields keep the same reference and don't re-render.
- **Typing coalesces** (same field + same key within 600 ms = one undo step).
- **AI edits are one history entry**, so one Ctrl+Z reverts the whole AI change. Ops that would introduce _new_ validation errors are rejected individually and reported.

## AI

- **Flat, loose AI schema + deterministic repair.** Gemini's structured output accepts only a JSON Schema subset and rejects large unions, so the model fills a simple shape (option labels, string values). `repairForm`/`applyAiEdit` turn it into strict data. Repair is deterministic, so streamed partial forms keep stable ids and React keys.
- **Generate streams raw JSON text built by hand** (not `toTextStreamResponse`), so a failure of the primary model _before any bytes are sent_ can switch to `AI_FALLBACK_MODEL` invisibly.
- **Fail fast to the fallback model, don't wait.** Measured on 2026-11-17: the free-tier primary (gemini-3.8-flash) often answered "high demand" (503), sometimes only after holding the request for ~4 minutes, while gemini-3.5-flash-lite answered in 2–3 s. So:
  - each attempt has a budget: generate drops a model with no first byte in 15 s or a 15 s stall; edit allows 20 s per model; 55 s in total, inside the 60 s `maxDuration`;
  - 429, 5xx/overload (including `StreamProviderError` inside an open stream) and our own timeouts switch models; bad requests don't;
  - the SDK's own retries are off when a fallback exists (its backoff was part of the long waits);
  - after a primary failure, the fallback goes first for 2 minutes (in-memory per instance; it only changes the order models are tried).
  - Not changed: the thinking level. `minimal` isn't supported by the primary, and `low` couldn't be measured while the primary was overloaded.
- **Prompt injection:** instructions live only in the system prompt; user text is fenced as data with closing tags stripped. Output is schema-constrained and re-validated, there are no tools, and results render as plain text.
- **Quota in Postgres** (`consume_ai_quota`, advisory lock): durable across serverless instances. Owners 20/h and 60/day; anonymous sandbox users 3 total; 400/day globally to protect the free tier.
- **Never sends respondent answers to the AI**; logs only ids/latency/model/validity.

## Frontend

- **Cache Components (Next 16 default).** Session/param reads live inside `<Suspense>`, so page shells prerender (◐ in the build output). The public demo stats are `"use cache"` + `cacheLife("minutes")` with a cookie-less client.
  - Trade-off: `notFound()` inside a streamed boundary renders the 404 UI with a 200 status (headers are already sent). Acceptable for `noindex` public form pages.
- **Theme without cookies.** An inline script sets `.dark` before paint from localStorage/OS preference. Reading a cookie in the root layout would make every page dynamic.
- **Editor store per instance via context** (App Router guidance), so the sandbox and owner editors never share state.
- **Persistence adapter.** The editor depends on `DraftPersistence { save }`; Supabase and localStorage implementations make the no-sign-in sandbox the _same_ editor.
- **FormRunner re-renders only when rule-dependency fields change** (`useWatch` on those names). Each field uses `useController`, so typing re-renders one field.
- **Error summary pattern:** on a failed "Next", focus moves to a summary linking to each invalid field; on step change, focus moves to the step heading.
- **Respondent autosave:** localStorage mirror on every change (survives refresh/offline), debounced server save in a single worker loop, newer-local-backup restore after mount (keeps hydration deterministic).
- **Hand-built charts:** HTML/CSS bars with direct labels, hover+focus tooltips and a table view. Single series, so one accent colour and no categorical palette.
- **TanStack Table v9** with an explicit module-level `tableFeatures` registry; we own the `<table>` markup. Virtualisation uses spacer rows so real table semantics stay.
- **Versions pinned to what create-next-app ships** (TypeScript 5.9, ESLint 9) rather than TS 7 / ESLint 10, which Next 16 doesn't target yet.
