// =============================================================
// AI routing layer (Vercel AI SDK).
// Maps each action to a model class per tier policy:
//   - budget models for Room Check / Standard Tutor
//   - a flagship model for the Master Focus Coach (Ultimate only)
// Model ids are read from env so they can be tuned without code changes.
// =============================================================
import "server-only";
import { generateText, generateObject, streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { AiAction, RoomCheckLevel } from "@/lib/config";
import { PROMPTS, ROOM_CHECK_PROMPT, ROOM_CHECK_STRICTNESS } from "./prompts";

export type ModelClass = "budget" | "flagship";

export const ACTION_MODEL_CLASS: Record<AiAction, ModelClass> = {
  room_check: "budget",
  standard_tutor: "budget",
  master_coach: "flagship",
};

/** Resolve the concrete model id for an action (overridable via env). */
export function modelIdFor(action: AiAction): string {
  const cls = ACTION_MODEL_CLASS[action];
  if (cls === "flagship") {
    return process.env.AI_FLAGSHIP_MODEL ?? "claude-opus-4-8";
  }
  return process.env.AI_BUDGET_MODEL ?? "claude-haiku-4-5-20251001";
}

export function systemPromptFor(action: AiAction): string {
  return PROMPTS[action];
}

function hasProvider(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Text generation for Standard Tutor and the Master Focus Coach's plan /
 * reflection copy. Falls back to a deterministic stub when no provider key
 * is configured, so routes stay testable without live credentials.
 */
export async function generateForAction(
  action: AiAction,
  prompt: string
): Promise<{ text: string; model: string }> {
  const model = modelIdFor(action);
  if (!hasProvider()) {
    return {
      model,
      text: `[stub:${action}] AI not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable real generation. Prompt was: ${prompt.slice(0, 120)}`,
    };
  }
  const { text } = await generateText({
    model: anthropic(model),
    system: systemPromptFor(action),
    prompt,
  });
  return { model, text };
}

/**
 * One streamed check-in or reflection line for the Master Focus Coach.
 * Returns a Response (via `.toTextStreamResponse()`-shaped object) so route
 * handlers can pass it straight through.
 */
export function streamCoachMessage(prompt: string): { toTextStreamResponse(): Response } {
  if (!hasProvider()) {
    const stubText = `[stub:master_coach] AI not configured. Set ANTHROPIC_API_KEY to enable real coaching. Prompt was: ${prompt.slice(0, 120)}`;
    return {
      toTextStreamResponse: () =>
        new Response(stubText, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    };
  }
  return streamText({
    model: anthropic(modelIdFor("master_coach")),
    system: PROMPTS.master_coach,
    prompt,
  });
}

// =============================================================
// Room Check vision verdicts
// =============================================================

export const RoomCheckVerdictSchema = z.object({
  areas: z.array(
    z.object({
      title: z.string().describe("Which photographed area this verdict covers"),
      pass: z.boolean(),
      note: z.string().describe("One short, specific, kind sentence"),
    })
  ),
  overallPass: z.boolean(),
  summary: z.string().describe("1-2 sentence overall verdict"),
});

export type RoomCheckVerdict = z.infer<typeof RoomCheckVerdictSchema>;

export interface RoomCheckImage {
  /** Base64-encoded image bytes, no `data:` URL prefix. */
  base64: string;
  mediaType: string;
  areaTitle: string;
}

/**
 * Send 1-4 room photos to Claude vision in a single message and get back a
 * structured per-area + overall verdict. Falls back to an honest stub
 * (never a fake "pass") when no provider key is configured.
 */
export async function generateRoomCheckVerdict(params: {
  level: RoomCheckLevel;
  images: RoomCheckImage[];
}): Promise<RoomCheckVerdict & { model: string }> {
  const model = modelIdFor("room_check");

  if (!hasProvider()) {
    return {
      model,
      areas: params.images.map((img) => ({
        title: img.areaTitle,
        pass: false,
        note: "AI not configured — set ANTHROPIC_API_KEY to enable real verification.",
      })),
      overallPass: false,
      summary: "[stub] ANTHROPIC_API_KEY not set; no real verification was performed.",
    };
  }

  const instructions = `${ROOM_CHECK_PROMPT}\n\n${ROOM_CHECK_STRICTNESS[params.level]}\n\nThere are ${params.images.length} photo(s) below, each preceded by a text label naming its area. Return exactly ${params.images.length} entries in "areas", in the same order as the labels, using each label as the "title".`;

  const { object } = await generateObject({
    model: anthropic(model),
    schema: RoomCheckVerdictSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instructions },
          ...params.images.flatMap((img) => [
            { type: "text" as const, text: `Area: ${img.areaTitle}` },
            { type: "image" as const, image: img.base64, mediaType: img.mediaType },
          ]),
        ],
      },
    ],
  });

  return { ...object, model };
}
