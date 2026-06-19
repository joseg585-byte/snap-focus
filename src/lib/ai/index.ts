// =============================================================
// AI routing layer (Vercel AI SDK).
// Maps each action to a model class per tier policy:
//   - budget models for Room Check / Standard Tutor
//   - a flagship model for the Master Focus Coach (Ultimate only)
// Model ids are read from env so they can be tuned without code changes.
// =============================================================
import type { AiAction } from "@/lib/config";
import { PROMPTS } from "./prompts";

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

/**
 * Placeholder generation entry point. Wire the Vercel AI SDK here once keys
 * are set:
 *   import { generateText } from "ai";
 *   import { anthropic } from "@ai-sdk/anthropic";
 *   const { text } = await generateText({ model: anthropic(modelIdFor(action)),
 *     system: systemPromptFor(action), prompt });
 * The scaffold returns a deterministic stub so routes are testable without keys.
 */
export async function generateForAction(
  action: AiAction,
  prompt: string
): Promise<{ text: string; model: string }> {
  const model = modelIdFor(action);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return {
      model,
      text: `[stub:${action}] AI not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY to enable real generation. Prompt was: ${prompt.slice(0, 120)}`,
    };
  }
  // TODO: real generateText() call once a provider key is present.
  return { model, text: `[${action}] generation pending real provider wiring.` };
}
