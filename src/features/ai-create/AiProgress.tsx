import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Step-by-step progress for AI generation.
 *
 * The current stage is DERIVED from what has actually streamed in (see `aiStage`), never
 * from timers, so it can't claim progress that hasn't happened:
 *   0 Reading      request sent, no parsable output yet
 *   1 Outlining    a title/steps exist, no questions yet
 *   2 Writing      questions are arriving
 *   3 Checking     stream finished; repairForm validates and fixes the result (synchronous,
 *                  so in practice this flips straight to "done")
 *   4 done         repaired form is ready
 *
 * The list is not a live region: the existing "Writing… N questions so far" status already
 * announces progress, and a second region would make screen readers talk over themselves.
 * Each item carries its state as visually hidden text instead.
 */

const STAGES = [
  "Reading your description",
  "Outlining the steps",
  "Writing questions",
  "Checking and repairing",
] as const;

export type AiStage = 0 | 1 | 2 | 3 | 4;

export function aiStage({
  loading,
  hasDraft,
  questionCount,
  finished,
}: {
  loading: boolean;
  hasDraft: boolean;
  questionCount: number;
  finished: boolean;
}): AiStage {
  if (finished) return 4;
  if (!loading) return 3;
  if (!hasDraft) return 0;
  return questionCount === 0 ? 1 : 2;
}

export function AiProgress({ stage, className }: { stage: AiStage; className?: string }) {
  return (
    <ol
      aria-label="Generation progress"
      className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-sm", className)}
    >
      {STAGES.map((label, i) => {
        const state = i < stage ? "done" : i === stage ? "active" : "pending";
        return (
          <li key={label} className="flex items-center gap-1.5">
            {state === "done" ? (
              <Icon name="check" className="size-3.5 text-success" />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 size-1.5 rounded-full",
                  state === "active" ? "animate-pulse bg-accent" : "bg-line-strong",
                )}
              />
            )}
            <span
              className={cn(
                state === "active" && "text-shimmer font-medium",
                state === "done" && "text-fg",
                state === "pending" && "text-fg-muted",
              )}
            >
              {label}
            </span>
            <span className="sr-only">
              {state === "done" ? "(done)" : state === "active" ? "(in progress)" : "(not started)"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
