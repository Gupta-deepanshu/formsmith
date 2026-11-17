# Formsmith — project context

AI-assisted form builder (Typeform / Google Forms style). Owners describe a form in plain English → AI drafts it (streamed into a live preview) → owner refines by hand or with "Ask AI" patch edits → publishes an immutable version at `/f/[slug]` → respondents fill it step by step (autosave, resume, review, submit) → owner analyses responses (table, CSV, funnel, completion, choice summaries).

**Purpose:** portfolio for SDE 2 *frontend* roles. Complexity belongs in the frontend (client state, schema, rule engine, validation, editor UX, streaming AI UI, perf, a11y). Supabase does auth/DB/RLS; custom backend is minimal. When making a non-obvious decision, explain it briefly (code comment or `docs/decisions.md`) so the user can defend it in interviews.

Full plan: `docs/PLAN.md`. Decision log: `docs/decisions.md`.

## Stack (verify APIs against current docs / installed types, not memory)
- Next.js 16 App Router, TypeScript strict, Tailwind v4 (`@tailwindcss/postcss`, `@theme` tokens, `@custom-variant dark`), pnpm, Vercel Hobby.
- Next 16: session refresh lives in `src/proxy.ts` (exported `proxy`), not `middleware.ts`. Cache Components is on: auth/user-specific pages must be dynamic.
- Supabase via `@supabase/ssr` (`createBrowserClient` / `createServerClient` with cookies `getAll`/`setAll`). Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY`. Server auth checks use `getClaims()`, never `getSession()`.
- Owners: Google sign-in. Respondents: `signInAnonymously()` (role `authenticated`, JWT claim `is_anonymous = true`).
- AI: Vercel AI SDK v7 + `@ai-sdk/google`. Streaming: `streamText({ output: Output.object({ schema }) })`; client `useObject` from `@ai-sdk/react`. Non-streamed: `generateText` + `Output.object`, read `result.output`. Only `src/server/ai/provider.ts` knows the provider; model id from env `AI_MODEL`.
- State: Zustand (editor, normalised, fine-grained selectors), React Hook Form + `zodResolver` (`@hookform/resolvers/zod`) on the public form, TanStack Table (headless) + TanStack Virtual for responses.

## Core (`src/core`) — pure TS, NO React/Next/Supabase imports
- `schema/` Zod form definition (form → steps → fields → conditions), `schemaVersion` literal, migrations between versions.
- `rules/` visibility engine: evaluate in step/field order; hidden fields' answers dropped (cascades); conditions may only reference earlier fields; cycles/forward refs rejected on save.
- `validation/` builds a Zod schema from a form definition. The SAME code validates per step in the browser and the whole response on the server at submit.
- `patch/` domain patch ops (add/update/remove/move for fields & steps, updateForm) with `apply` → `{ form, inverse }`. Used for undo/redo and AI edits.
- `repair/` turns AI output into a valid form (ids, dedupe, drop bad rules) or reports failure.
- Unit-tested with Vitest.

## Server pieces (only these three; all Route Handlers in `src/app/api/`)
1. `POST /api/ai/generate` — description → streamed partial form; client validates/repairs on finish; fallback to starter template.
2. `POST /api/ai/edit` — instruction + current form → `{ ops, summary }`, validated by core before being offered.
3. `POST /api/responses/[id]/submit` — re-validates against the *published version* with the shared validator, then marks submitted (secret key, server only). Never trust the client.
Everything else goes straight to Supabase from the client/server components under RLS, plus a few SQL functions (publish, public form lookup, resume claim, AI quota).

## Data model (see `supabase/migrations`)
- `forms`: id, owner_id, slug, title, draft_schema jsonb, published_version_id, is_demo, created_at, updated_at
- `form_versions`: id, form_id, version, schema jsonb, published_at. Immutable (no update/delete).
- `responses`: id, form_id (denormalised), version_id, respondent_id, status draft|submitted, answers jsonb, last_step_id, furthest_step_index, resume_token, started_at, updated_at, submitted_at
- `ai_requests`: id, owner_id, kind generate|edit, latency_ms, valid, created_at
RLS is ON for every table. Owners read and write only their own forms and versions, and read responses to their own forms. Public form data is read only via `get_published_form(slug)`. Respondents insert and update only their own draft and can only change `answers`/`last_step_id`/`furthest_step_index` (column grants). Respondents can never set `status`; only the submit handler can. Non-anonymous users only can own forms.

## UI rules
- NO external UI/animation/chart/DnD/icon libraries. Tailwind + plain React. Own components in `src/components/ui` with library-like props.
- Prefer native elements: `<dialog>`, `<select>`, `<details>`, native inputs + validation attributes.
- Neutral minimal design, one accent colour, tokens as CSS variables, light + dark.
- Motion: CSS opacity/transform transitions only, < 200 ms, disabled under `prefers-reduced-motion`.
- Charts: hand-built SVG/CSS with text alternative or data table.
- Editor reordering: move up/down buttons + keyboard shortcuts (no drag-and-drop).
- A11y is ours: roles, labels, visible focus, dialog focus management, focus moves to step heading on step change, error summary at top of step, `aria-live` announcements, full keyboard support.

## Constraints
- Free tiers only (Vercel Hobby, Supabase Free, Gemini free tier). Anything that could cost money or change architecture → ask first.
- Never send respondent answers to the AI. Never log personal data (log ids/latency only).
- Secrets: `.env.example` committed, `.env.local` gitignored. Secret key is never imported by client code (`import 'server-only'`).
- AI: cap input (2,000 chars description / 500 chars instruction). Treat user text as data inside delimiters. Rate-limit per owner via `ai_requests`.

## Working style
- pnpm. Allowed deps: next, react, typescript, tailwindcss, @supabase/supabase-js, @supabase/ssr, supabase (dev), zod, ai, @ai-sdk/google, @ai-sdk/react, zustand, react-hook-form, @hookform/resolvers, @tanstack/react-table, @tanstack/react-virtual, lint/format tooling, vitest. Ask before adding anything else.
- Run `pnpm typecheck && pnpm lint` (and `pnpm test` for core) after each major piece; keep them green.
- Conventional commits at checkpoints. Never push unless asked.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm test`
- `pnpm supabase migration new <name>` creates a migration. `pnpm supabase db push` applies it to the linked remote project.
- `pnpm db:types` regenerates `src/lib/supabase/database.types.ts` from the linked project.
