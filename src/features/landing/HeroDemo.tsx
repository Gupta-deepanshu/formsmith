"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge, Icon, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Landing-page hero demo: a description "types itself" into a prompt box, then a draft form
 * builds below it question by question, holds, and moves on to the next example.
 *
 * It is a scripted illustration, not a live AI call (no quota, no network, identical for
 * every visitor). Design choices worth defending:
 * - The initial state is the FINISHED first example. Server HTML, reduced-motion users and
 *   no-JS visitors all see a complete, meaningful demo, and hydration can't mismatch.
 * - It only animates while on screen and while the tab is visible (IntersectionObserver +
 *   visibilitychange), so it costs nothing when nobody is looking.
 * - WCAG 2.2.2 (Pause, Stop, Hide): it moves for longer than 5 s, so there is a pause button.
 * - The animated region is aria-hidden (a screen reader would otherwise hear every keystroke);
 *   a visually hidden sentence describes the same thing once.
 */

type DemoField = { label: string; type: string; required?: boolean; conditional?: boolean };
type Example = { prompt: string; title: string; fields: DemoField[] };

// Every example has the same number of questions, so the card height never jumps.
const EXAMPLES: [Example, ...Example[]] = [
  {
    prompt:
      "Customer feedback survey: overall rating, which features they use, and a follow-up question only if the rating is 2 or less.",
    title: "Customer feedback",
    fields: [
      { label: "How satisfied are you overall?", type: "Rating (1–5)", required: true },
      { label: "Which features do you use most?", type: "Multiple choice" },
      { label: "What went wrong for you?", type: "Long text", conditional: true },
      { label: "Can we contact you about this?", type: "Yes / No" },
      { label: "Email", type: "Email", conditional: true },
    ],
  },
  {
    prompt:
      "Registration for a two-day developer meetup with ticket type, dietary needs, and a talk proposal only for speakers.",
    title: "Meetup registration",
    fields: [
      { label: "Full name", type: "Short text", required: true },
      { label: "Email", type: "Email", required: true },
      { label: "Ticket type", type: "Dropdown", required: true },
      { label: "Dietary requirements", type: "Multiple choice" },
      { label: "Talk title and abstract", type: "Long text", conditional: true },
    ],
  },
  {
    prompt:
      "Job application with contact details, years of experience, a portfolio link, and leadership questions for senior roles.",
    title: "Job application",
    fields: [
      { label: "Full name", type: "Short text", required: true },
      { label: "Role level", type: "Single choice", required: true },
      { label: "Years of experience", type: "Number", required: true },
      { label: "Portfolio link", type: "URL" },
      { label: "Describe a team you led", type: "Long text", conditional: true },
    ],
  },
];

/** Non-empty tuple, so the fallback below is always defined. */
const exampleAt = (i: number): Example => EXAMPLES[i] ?? EXAMPLES[0];

type Phase = "typing" | "building" | "holding" | "clearing";
type State = { ex: number; chars: number; shown: number; phase: Phase };

const finished = (ex: number): State => ({
  ex,
  chars: exampleAt(ex).prompt.length,
  shown: exampleAt(ex).fields.length,
  phase: "holding",
});

/** Pure script: given the current frame, how long to wait and what comes next. */
function advance(s: State): { delay: number; next: State } {
  const { prompt, fields } = exampleAt(s.ex);
  switch (s.phase) {
    case "typing": {
      if (s.chars >= prompt.length) return { delay: 450, next: { ...s, phase: "building" } };
      const pause = /[,:.]/.test(prompt[s.chars - 1] ?? "") ? 160 : 0;
      return { delay: 24 + pause, next: { ...s, chars: s.chars + 1 } };
    }
    case "building":
      if (s.shown >= fields.length) return { delay: 0, next: { ...s, phase: "holding" } };
      return { delay: 340, next: { ...s, shown: s.shown + 1 } };
    case "holding":
      return { delay: 3200, next: { ...s, phase: "clearing" } };
    case "clearing":
      return {
        delay: 180,
        next: { ex: (s.ex + 1) % EXAMPLES.length, chars: 0, shown: 0, phase: "typing" },
      };
  }
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function HeroDemo() {
  // Server snapshot = reduced: render the static finished state until the client knows.
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCED).matches,
    () => true,
  );
  const [state, setState] = useState<State>(() => finished(0));
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false));
    io.observe(el);
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const running = !reduced && !paused && onScreen && tabVisible;
  useEffect(() => {
    if (!running) return;
    const { delay, next } = advance(state);
    const id = setTimeout(() => setState(next), delay);
    return () => clearTimeout(id);
  }, [state, running]);

  // Reduced motion: always show a complete example, even if it was switched on mid-animation.
  const view = reduced ? finished(state.ex) : state;
  const ex = exampleAt(view.ex);
  const typing = view.phase === "typing";
  const building = view.phase === "building";
  const done = view.phase === "holding" || view.phase === "clearing";
  const promptDone = view.chars >= ex.prompt.length;

  return (
    <div ref={rootRef} className="w-full text-left">
      <p className="sr-only">
        Example: you describe “{EXAMPLES[0].prompt}” and Formsmith drafts a{" "}
        {EXAMPLES[0].fields.length}-question form with conditional follow-ups.
      </p>

      <div
        aria-hidden="true"
        className={cn(
          "grid gap-3 transition-opacity duration-150 sm:grid-cols-[5fr_6fr]",
          view.phase === "clearing" && "opacity-0",
        )}
      >
        {/* Prompt box */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-medium text-fg-muted">Describe your form</p>
          <p className="min-h-[7lh] text-sm leading-relaxed">
            {ex.prompt.slice(0, view.chars)}
            {typing ? (
              <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.2em] animate-caret bg-fg" />
            ) : null}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 self-end rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-150",
              promptDone ? "bg-accent text-on-accent" : "bg-subtle text-fg-muted",
            )}
          >
            <Icon name="sparkle" /> Generate form
          </span>
        </div>

        {/* Draft preview */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            {view.shown > 0 || done ? (
              <p className="animate-fade font-semibold">{ex.title}</p>
            ) : (
              <span className="h-5 w-32 rounded-control bg-subtle" />
            )}
            <span className="text-xs whitespace-nowrap">
              {building ? (
                <span className="text-shimmer">Writing questions…</span>
              ) : done ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <Icon name="check" className="size-3.5" /> {ex.fields.length} questions
                </span>
              ) : (
                <span className="text-fg-muted">Draft</span>
              )}
            </span>
          </div>
          <ol className="flex flex-col gap-1.5">
            {ex.fields.map((f, i) =>
              i < view.shown ? (
                <li
                  key={`${view.ex}-${i}`}
                  className="flex h-9 animate-enter items-center gap-2 rounded-control border border-line px-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {f.label}
                    {f.required ? <span className="text-danger"> *</span> : null}
                  </span>
                  {f.conditional ? (
                    <Badge tone="accent" className="hidden sm:inline-flex">
                      Conditional
                    </Badge>
                  ) : null}
                  <span className="shrink-0 text-xs text-fg-muted">{f.type}</span>
                </li>
              ) : (
                <li key={`${view.ex}-${i}`} className="h-9 rounded-control bg-subtle/60" />
              ),
            )}
          </ol>
        </div>
      </div>

      {/* Space is always reserved (invisible, not removed) so the page doesn't shift once the
          client learns the motion preference. Invisible elements aren't focusable. */}
      <div className={cn("mt-2 flex justify-end", reduced && "invisible")}>
        <IconButton
          size="sm"
          variant="ghost"
          label={paused ? "Play demo animation" : "Pause demo animation"}
          icon={<Icon name={paused ? "play" : "pause"} />}
          onClick={() => setPaused((p) => !p)}
        />
      </div>
    </div>
  );
}
