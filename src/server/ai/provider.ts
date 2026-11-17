import "server-only";
import { google } from "@ai-sdk/google";
import { APICallError, RetryError, type LanguageModel } from "ai";

/**
 * The ONLY file that knows which AI provider we use. Swap Gemini for another provider by
 * changing this file (and the env vars); routes only see `LanguageModel`s.
 * The API key is read from GOOGLE_GENERATIVE_AI_API_KEY by @ai-sdk/google.
 */

export type ModelChoice = { id: string; model: LanguageModel };

export function modelChain(): ModelChoice[] {
  const primary = process.env.AI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.AI_FALLBACK_MODEL;
  const chain: ModelChoice[] = [{ id: primary, model: google(primary) }];
  if (fallback && fallback !== primary) chain.push({ id: fallback, model: google(fallback) });
  return chain;
}

export function isAiConfigured(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/** True for provider rate-limit / quota errors (HTTP 429, Gemini RESOURCE_EXHAUSTED), including after SDK retries. */
export function isRateLimitError(error: unknown): boolean {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(e)) {
    return e.statusCode === 429 || /RESOURCE_EXHAUSTED|rate limit|quota/i.test(e.message);
  }
  return error instanceof Error && /RESOURCE_EXHAUSTED|429/.test(error.message);
}

/** Safe summary of an AI error for server logs: no prompts, no content, no personal data. */
export function describeAiError(error: unknown): string {
  const e = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(e)) return `APICallError status=${e.statusCode ?? "?"}`;
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Run `call` with the primary model; on a rate-limit error, retry once with the fallback
 * model. Other errors are not retried here (the SDK already retries transient failures).
 */
export async function withModelFallback<T>(
  call: (choice: ModelChoice) => Promise<T>,
): Promise<{ value: T; modelId: string }> {
  const chain = modelChain();
  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const choice = chain[i]!;
    try {
      return { value: await call(choice), modelId: choice.id };
    } catch (e) {
      lastError = e;
      if (!isRateLimitError(e) || i === chain.length - 1) throw e;
    }
  }
  throw lastError;
}
