import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-user AI quota via the consume_ai_quota SQL function: atomic and durable across
 * serverless instances (an in-memory counter would reset per cold start and differ per
 * instance). Called with the user's own session, so no secret key is involved.
 */

export type QuotaResult =
  | { allowed: true; requestId: string; remaining: number | null }
  | {
      allowed: false;
      reason: "hourly_limit" | "daily_limit" | "anonymous_limit" | "global";
      retryAfterSeconds?: number;
    };

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function consumeQuota(
  supabase: Supabase,
  kind: "generate" | "edit",
): Promise<QuotaResult> {
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_kind: kind });
  if (error || !data) throw new Error("quota check failed");
  return data as unknown as QuotaResult;
}

export async function finishRequest(
  supabase: Supabase,
  requestId: string,
  startedAt: number,
  valid: boolean,
  modelId: string,
) {
  // Metadata only (latency, validity, model). Never prompt or output content.
  await supabase.rpc("finish_ai_request", {
    p_request_id: requestId,
    p_latency_ms: Date.now() - startedAt,
    p_valid: valid,
    p_model: modelId,
  });
}

export function quotaResponse(q: Extract<QuotaResult, { allowed: false }>): Response {
  return Response.json(
    { error: "AI limit reached", reason: q.reason, retryAfterSeconds: q.retryAfterSeconds },
    {
      status: 429,
      headers: q.retryAfterSeconds ? { "retry-after": String(q.retryAfterSeconds) } : undefined,
    },
  );
}
