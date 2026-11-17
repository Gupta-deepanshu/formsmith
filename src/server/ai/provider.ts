import "server-only";
import { google } from "@ai-sdk/google";
import { APICallError, RetryError, StreamProviderError, type LanguageModel } from "ai";

/**
 * The ONLY file that knows which AI provider we use. Swap Gemini for another provider by
 * changing this file (and the env vars); routes only see `LanguageModel`s.
 * The API key is read from GOOGLE_GENERATIVE_AI_API_KEY by @ai-sdk/google.
 *
 * Latency policy (see docs/decisions.md): on the free tier the primary model is often
 * overloaded, and the API can hold a request for minutes before failing. So we don't wait:
 * each attempt has a short time budget, overload/rate-limit/timeout errors switch to the
 * fallback model, and after a primary failure the fallback goes first for a short cooldown.
 */

export type ModelChoice = { id: string; model: LanguageModel; isLast: boolean };

export const AI_TIMEOUTS = {
  /** Generate: give up on a model if it hasn't streamed its first byte by then. */
  firstByteMs: 15_000,
  /** Generate: give up if the stream goes quiet for this long mid-way. */
  idleMs: 15_000,
  /** Edit (not streamed): budget per model attempt. */
  editAttemptMs: 20_000,
  /** Hard stop for a whole request, inside the routes' maxDuration (60s). */
  totalMs: 55_000,
} as const;

const COOLDOWN_MS = 2 * 60_000;
/** Per server instance (module state). Good enough: it only changes the order we try models in. */
let primaryCooldownUntil = 0;

const primaryId = () => process.env.AI_MODEL || "gemini-3.8-flash";

export function modelChain(): ModelChoice[] {
  const primary = primaryId();
  const fallback = process.env.AI_FALLBACK_MODEL;
  const ids = fallback && fallback !== primary ? [primary, fallback] : [primary];
  if (ids.length > 1 && Date.now() < primaryCooldownUntil) ids.reverse();
  return ids.map((id, i) => ({ id, model: google(id), isLast: i === ids.length - 1 }));
}

/** Call when a model failed with a transient error or timed out, so the next requests skip it for a while. */
export function reportModelFailure(choice: ModelChoice) {
  if (choice.id === primaryId()) primaryCooldownUntil = Date.now() + COOLDOWN_MS;
}

export function isAiConfigured(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * True for provider errors worth retrying on another model: rate limits / quota (429,
 * RESOURCE_EXHAUSTED) and overload / outages (5xx, "high demand", UNAVAILABLE). Not for
 * bad requests or safety blocks, which another model would likely hit too.
 */
export function isTransientProviderError(error: unknown): boolean {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  const pattern =
    /RESOURCE_EXHAUSTED|rate limit|quota|high demand|overloaded|UNAVAILABLE|try again later/i;
  if (APICallError.isInstance(e)) {
    const s = e.statusCode ?? 0;
    return s === 429 || s >= 500 || pattern.test(e.message);
  }
  // Errors reported inside an already-open stream (e.g. overload after the HTTP 200).
  if (StreamProviderError.isInstance(e)) {
    const s = e.statusCode ?? 0;
    return e.isRetryable || s === 429 || s >= 500 || pattern.test(e.message);
  }
  return e instanceof Error && (pattern.test(e.message) || /\b(429|50[0-4])\b/.test(e.message));
}

/** Safe summary of an AI error for server logs: no prompts, no content, no personal data. */
export function describeAiError(error: unknown): string {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(e)) return `APICallError status=${e.statusCode ?? "?"}`;
  if (StreamProviderError.isInstance(e))
    return `StreamProviderError status=${e.statusCode ?? "?"} code=${e.code ?? "?"} retryable=${e.isRetryable}`;
  return error instanceof Error ? error.name : "UnknownError";
}

export class AiTimeoutError extends Error {
  override name = "AiTimeoutError";
}

/**
 * Non-streamed calls: try each model with its own time budget; on a transient error or a
 * timeout, move to the next model. Stops at once if the client went away.
 */
export async function withModelFallback<T>(
  call: (choice: ModelChoice, signal: AbortSignal) => Promise<T>,
  { signal, attemptMs }: { signal?: AbortSignal; attemptMs: number },
): Promise<{ value: T; modelId: string }> {
  const chain = modelChain();
  const deadline = Date.now() + AI_TIMEOUTS.totalMs;
  let lastError: unknown;
  for (const choice of chain) {
    const budget = Math.min(attemptMs, deadline - Date.now());
    if (budget <= 1000) break;
    const timeout = AbortSignal.timeout(budget);
    const attempt = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      return { value: await call(choice, attempt), modelId: choice.id };
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = timeout.aborted ? new AiTimeoutError(`no answer within ${budget}ms`) : e;
      const retryable = timeout.aborted || isTransientProviderError(e);
      if (retryable) reportModelFailure(choice);
      if (!retryable || choice.isLast) break;
    }
  }
  throw lastError ?? new AiTimeoutError("no time left for another attempt");
}
