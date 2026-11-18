# Formsmith

An AI-assisted form builder. Describe a form in plain English, refine it in a three-panel editor (by hand or by asking the AI), publish it to a public link, and analyse responses. Respondents fill it in one step at a time on any device, with autosave and resume links.

A portfolio project focused on frontend engineering: client state, a form schema and rule engine, shared validation, editor UX with undo/redo, streaming AI UI, performance and accessibility. Supabase handles auth, data and access rules.

- **Try without an account:** `/try` (full editor, saved in your browser, 3 AI requests), `/f/demo` (demo form), `/demo` (its live totals).

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Supabase (Postgres, RLS, Google + anonymous auth) · Vercel AI SDK v7 with Gemini · Zustand · React Hook Form · TanStack Table v9 + Virtual · Vitest. No UI kit, chart or icon libraries: components are hand-built in `src/components/ui` and charts are hand-drawn SVG. A few credited extras: Lenis (smooth scroll on the landing and demo pages), an adapted Kokonut UI theme switch (MIT) and the React Bits Molten Metal hero shader.

## Architecture

```
src/core/        framework-free TypeScript: schema, rules, validation, patches, AI repair, analytics (unit-tested)
src/components/  ui/ (design system), form-renderer/ (shared step runner), charts/
src/features/    editor, ai-create, ai-edit, public-form, responses, forms-list, auth
src/server/ai/   provider (only Gemini-aware file), prompts, quota
src/app/         routes; api/ has the only three server pieces:
                   POST /api/ai/generate        stream a form draft
                   POST /api/ai/edit            instruction -> validated patch ops
                   POST /api/responses/[id]/submit  re-validate + mark submitted
supabase/migrations/  tables, RLS, column grants, security-definer functions, demo seed
```

See `docs/PLAN.md` for the full design and `docs/decisions.md` for the reasoning behind each choice.

## Setup

1. `pnpm install`
2. `cp .env.example .env.local` and fill in the Supabase URL, publishable key, secret key and Gemini key. **Never commit `.env.local`.**
3. In Supabase, enable Google and anonymous sign-ins, then add `http://localhost:3000/auth/callback` (and your production URL) to the auth redirect URLs.
4. `pnpm supabase login`, then `pnpm supabase link --project-ref <ref>`, then `pnpm supabase db push --remote`.
5. Optionally run `pnpm db:types` to regenerate database types from the linked project.
6. Run `pnpm check:rls` after every migration: it exercises RLS, column grants and the SQL functions as real temporary users on the linked project, then deletes them.
6. `pnpm dev`

## Scripts

`pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` (core unit tests) · `pnpm check` (all three) · `pnpm format`

## Accessibility checklist (manual)

- [ ] Keyboard only: create a form, reorder with Alt+arrows, undo/redo, publish, fill the public form, submit.
- [ ] Screen reader (NVDA/VoiceOver): step changes announce the heading; failed "Next" focuses the error summary; toasts and save status are announced.
- [ ] `prefers-reduced-motion`: no animations.
- [ ] 320 px width: public form and editor tabs usable without horizontal scrolling.
- [ ] Both themes: focus rings and text contrast visible.

## Performance check (React Profiler)

In the editor, record while typing in a question label. Expected: only that question's structure row, its settings panel and its preview field commit; other rows don't re-render (normalised Zustand store + narrow selectors + structural sharing).
