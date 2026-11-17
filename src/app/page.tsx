import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { buttonClasses, Card, Icon, type IconName } from "@/components/ui";

/** Static landing page (prerendered). */
export default function Home() {
  return (
    <>
      <SiteHeader>
        <Link href="/sign-in" className="rounded-control px-2 py-1 text-sm font-medium text-fg-muted hover:text-fg">
          Sign in
        </Link>
      </SiteHeader>
      <main id="main" className="flex-1">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 pt-16 pb-12 text-center sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-muted">
            <Icon name="sparkle" className="text-accent" /> AI writes the first draft. You stay in control.
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Describe a form. Get a form.</h1>
          <p className="max-w-2xl text-lg text-pretty text-fg-muted">
            Formsmith turns a plain-English description into a multi-step form with validation and conditional logic. Refine it by hand or by asking the AI, publish a link, and watch responses come in.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/sign-in" className={buttonClasses({ variant: "primary", size: "lg" })}>
              Get started
            </Link>
            <Link href="/try" className={buttonClasses({ size: "lg" })}>
              Try the editor
            </Link>
            <Link href="/f/demo" className={buttonClasses({ size: "lg", variant: "ghost" })}>
              Try the demo form
            </Link>
          </div>
          <p className="text-sm text-fg-muted">
            No account needed for the editor or the demo.{" "}
            <Link href="/demo" className="text-accent underline-offset-2 hover:underline">
              See the demo&apos;s live results
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="features-heading" className="mx-auto w-full max-w-5xl px-4 pb-16">
          <h2 id="features-heading" className="sr-only">
            Features
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <Card className="flex h-full flex-col gap-2">
                  <span className="grid size-9 place-items-center rounded-control bg-accent-soft text-accent">
                    <Icon name={f.icon} />
                  </span>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-fg-muted">{f.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="built-heading" className="border-t border-line bg-surface">
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="built-heading" className="text-xl font-semibold">
                How it&apos;s built
              </h2>
              <p className="mt-2 text-sm text-fg-muted">A frontend-heavy app: the interesting logic lives in a framework-free TypeScript core.</p>
            </div>
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              {BUILT.map(([title, body]) => (
                <li key={title} className="rounded-control border border-line p-3">
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-fg-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t border-line py-6 text-center text-xs text-fg-muted">Formsmith · a portfolio project</footer>
    </>
  );
}

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "sparkle", title: "AI first draft", body: "Watch the form stream in as it's written. Anything invalid is repaired or replaced with a template." },
  { icon: "edit", title: "Precise editor", body: "Three panels, undo/redo across manual and AI edits, keyboard shortcuts, and show-only-if rules." },
  { icon: "check", title: "Respondent-friendly", body: "One step at a time, validation before moving on, autosave, resume links and a review step." },
  { icon: "rule", title: "Useful results", body: "Drop-off funnel, completion rate, per-question summaries, a sortable table and CSV export." },
];

const BUILT: [string, string][] = [
  ["Shared validator", "One Zod schema is built from the form definition and runs in the browser per step and on the server at submit."],
  ["Rule engine", "Visibility evaluated in one ordered pass; hidden answers dropped; circular rules rejected on save."],
  ["Patch operations", "Id-keyed ops that compute their own inverse, so they serve as the undo log and the AI's output format."],
  ["Fine-grained state", "A normalised Zustand store with structural sharing: typing in one field re-renders only that field."],
  ["Security by default", "Row Level Security and column grants on every table; the secret key is used in exactly one server path."],
  ["Hand-built UI", "No component, chart or animation libraries: native elements, our own accessible components, CSS motion."],
];
