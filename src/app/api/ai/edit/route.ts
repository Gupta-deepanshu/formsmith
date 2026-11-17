import { generateText, Output } from "ai";
import { z } from "zod";
import { FormDefinitionSchema, normalize } from "@/core";
import { applyAiEdit } from "@/core/ai/edit";
import { AI_LIMITS, AiEditSchema } from "@/core/ai/schemas";
import { createClient } from "@/lib/supabase/server";
import {
  AI_TIMEOUTS,
  describeAiError,
  isAiConfigured,
  withModelFallback,
} from "@/server/ai/provider";
import { EDIT_SYSTEM, editPrompt } from "@/server/ai/prompts";
import { consumeQuota, finishRequest, quotaResponse } from "@/server/ai/quota";

/**
 * AI edit: instruction + current form (structure only) -> validated patch ops.
 * Every op is converted and checked by core (applyAiEdit). Only ops that apply cleanly
 * and add no new validation errors are returned, and the client re-validates them with
 * PatchOpSchema before applying.
 */
export const maxDuration = 60;

const MAX_BODY = 80_000;
const Body = z.object({
  instruction: z
    .string()
    .trim()
    .min(3, "Tell the AI what to change.")
    .max(AI_LIMITS.instructionMax),
  form: FormDefinitionSchema,
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return Response.json({ error: "Sign in to use AI." }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY)
    return Response.json({ error: "This form is too large for AI editing." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success)
    return Response.json(
      {
        error:
          body.error.issues[0]?.path[0] === "instruction"
            ? body.error.issues[0].message
            : "The form couldn't be read.",
      },
      { status: 400 },
    );
  if (!isAiConfigured())
    return Response.json({ error: "AI isn't configured on this server." }, { status: 503 });

  const quota = await consumeQuota(supabase, "edit").catch(() => null);
  if (!quota)
    return Response.json({ error: "Couldn't check your AI quota. Try again." }, { status: 503 });
  if (!quota.allowed) return quotaResponse(quota);

  const startedAt = Date.now();
  let modelId = "unknown";
  try {
    const { value, modelId: used } = await withModelFallback(
      async (choice, signal) => {
        modelId = choice.id;
        const r = await generateText({
          model: choice.model,
          system: EDIT_SYSTEM,
          prompt: editPrompt(body.data.instruction, body.data.form),
          output: Output.object({ schema: AiEditSchema }),
          // With a fallback available, switching models beats the SDK's backoff retries.
          maxRetries: choice.isLast ? 1 : 0,
          abortSignal: signal,
        });
        return r.output;
      },
      { signal: request.signal, attemptMs: AI_TIMEOUTS.editAttemptMs },
    );
    modelId = used;

    const outcome = applyAiEdit(normalize(body.data.form), value.ops);
    await finishRequest(
      supabase,
      quota.requestId,
      startedAt,
      outcome.ops.length > 0 || value.ops.length === 0,
      modelId,
    ).catch(() => {});

    if (value.ops.length > 0 && outcome.ops.length === 0) {
      return Response.json(
        {
          error: "The AI's changes didn't pass validation, so nothing was changed. Try rephrasing.",
          rejected: outcome.rejected,
        },
        { status: 422 },
      );
    }
    return Response.json(
      {
        summary: value.summary.slice(0, 200),
        ops: outcome.ops,
        rejected: outcome.rejected,
        changedFieldIds: outcome.changedFieldIds,
        changedStepIds: outcome.changedStepIds,
        remaining: quota.remaining,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    console.error("[ai/edit] failed:", describeAiError(e));
    await finishRequest(supabase, quota.requestId, startedAt, false, modelId).catch(() => {});
    return Response.json(
      { error: "The AI couldn't process that right now. Please try again." },
      { status: 502 },
    );
  }
}
