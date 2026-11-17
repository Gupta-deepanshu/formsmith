import { Output, streamText } from "ai";
import { z } from "zod";
import { repairForm } from "@/core/ai/repair";
import { AI_LIMITS, AiFormSchema } from "@/core/ai/schemas";
import { createClient } from "@/lib/supabase/server";
import { describeAiError, isAiConfigured, isRateLimitError, modelChain } from "@/server/ai/provider";
import { GENERATE_SYSTEM, generatePrompt } from "@/server/ai/prompts";
import { consumeQuota, finishRequest, quotaResponse } from "@/server/ai/quota";

/**
 * AI generate: description -> form, streamed as raw JSON text that the client's useObject
 * parses into a partial object for the live preview. The client validates and repairs the
 * final object with the same core repairForm used here.
 *
 * Route Handler (not a Server Action) because it has to stream, and because status codes
 * (401/413/429/503) map directly onto UI states.
 */
export const maxDuration = 60;

const Body = z.object({ description: z.string().trim().min(10, "Describe the form in a few words.").max(AI_LIMITS.descriptionMax) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return Response.json({ error: "Sign in to use AI." }, { status: 401 });

  const raw = await request.text();
  if (raw.length > AI_LIMITS.descriptionMax * 2 + 200) return Response.json({ error: "That description is too long." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  if (!isAiConfigured()) return Response.json({ error: "AI isn't configured on this server." }, { status: 503 });

  const quota = await consumeQuota(supabase, "generate").catch(() => null);
  if (!quota) return Response.json({ error: "Couldn't check your AI quota. Try again." }, { status: 503 });
  if (!quota.allowed) return quotaResponse(quota);

  const startedAt = Date.now();
  const chain = modelChain();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < chain.length; i++) {
        const choice = chain[i]!;
        let text = "";
        let failure: unknown = null;
        const result = streamText({
          model: choice.model,
          system: GENERATE_SYSTEM,
          prompt: generatePrompt(body.data.description),
          output: Output.object({ schema: AiFormSchema }),
          maxRetries: 1,
          abortSignal: request.signal,
        });
        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              text += part.text;
              controller.enqueue(encoder.encode(part.text));
            } else if (part.type === "error") {
              failure = part.error;
              break;
            }
          }
        } catch (e) {
          failure = e;
        }

        if (!failure) {
          let valid = false;
          try {
            valid = repairForm(JSON.parse(text)).ok;
          } catch {
            valid = false;
          }
          await finishRequest(supabase, quota.requestId, startedAt, valid, choice.id).catch(() => {});
          try {
            controller.close();
          } catch {
            // client already went away
          }
          return;
        }

        // Rate-limited before anything was sent: quietly switch to the fallback model.
        if (text === "" && isRateLimitError(failure) && i < chain.length - 1) continue;

        console.error("[ai/generate] failed:", describeAiError(failure));
        await finishRequest(supabase, quota.requestId, startedAt, false, choice.id).catch(() => {});
        try {
          controller.error(new Error("generation failed"));
        } catch {
          // client already went away
        }
        return;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...(quota.remaining != null ? { "x-ai-remaining": String(quota.remaining) } : {}),
    },
  });
}
