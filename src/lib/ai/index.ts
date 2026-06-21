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
import {
  PROMPTS,
  ROOM_CHECK_PROMPT,
  ROOM_CHECK_STRICTNESS,
  STANDARD_TUTOR_PROMPT,
  TUTOR_GRADE_PROMPT,
  MASTER_COACH_PLAN_PROMPT,
  MASTER_COACH_TEACH_PROMPT,
  MASTER_COACH_REPORT_PROMPT,
} from "./prompts";

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

// =============================================================
// Standard Tutor — structured questions + grading
// =============================================================

const TutorQuestionSchema = z.object({
  prompt: z.string().describe("The question text shown to the student"),
  correct_answer: z.string().describe("The single correct final answer"),
  solution_path: z.string().describe("Teacher-quality step-by-step solution a grader can check shown work against"),
});

export type TutorQuestion = z.infer<typeof TutorQuestionSchema>;

const TutorLessonSchema = z.object({
  questions: z.array(TutorQuestionSchema).min(3).max(7),
});

/**
 * Generate 3-7 graded practice questions for a lesson. Each question carries
 * its own correct answer + solution path so /api/tutor/grade never has to
 * call the model just to know what "right" looks like.
 */
export async function generateTutorLesson(
  prompt: string
): Promise<{ questions: TutorQuestion[]; model: string }> {
  const model = modelIdFor("standard_tutor");
  if (!hasProvider()) {
    return {
      model,
      questions: [
        {
          prompt: "[stub] AI not configured. Set ANTHROPIC_API_KEY to enable real lesson generation.",
          correct_answer: "N/A",
          solution_path: "N/A",
        },
      ],
    };
  }
  const { object } = await generateObject({
    model: anthropic(model),
    schema: TutorLessonSchema,
    system: STANDARD_TUTOR_PROMPT,
    prompt,
  });
  return { questions: object.questions, model };
}

const GradeResultSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().describe("Short, kind, specific feedback readable by a kid"),
});

export type GradeResult = z.infer<typeof GradeResultSchema>;

/** Grade a student's shown work + answer against the stored solution. */
export async function gradeTutorAnswer(params: {
  question: string;
  correctAnswer: string;
  solutionPath: string;
  workShown: string;
  answer: string;
}): Promise<GradeResult & { model: string }> {
  const model = modelIdFor("standard_tutor");
  if (!hasProvider()) {
    return {
      model,
      correct: false,
      feedback: "[stub] AI not configured — set ANTHROPIC_API_KEY to enable real grading.",
    };
  }

  const prompt = [
    `Question: ${params.question}`,
    `Correct answer: ${params.correctAnswer}`,
    `Solution path: ${params.solutionPath}`,
    `Student's shown work: ${params.workShown || "(none provided)"}`,
    `Student's answer: ${params.answer}`,
  ].join("\n\n");

  const { object } = await generateObject({
    model: anthropic(model),
    schema: GradeResultSchema,
    system: TUTOR_GRADE_PROMPT,
    prompt,
  });
  return { ...object, model };
}

// =============================================================
// Master Focus Coach — coached subject study sessions
// =============================================================

const SessionBlockSchema = z.object({
  topic: z.string().describe("A specific concept within the subject, not the whole subject"),
  activity: z.string().describe("One line describing what the coach does in this block"),
  minutes: z.number().int().positive(),
});

export type SessionBlock = z.infer<typeof SessionBlockSchema>;

const SessionPlanSchema = z.object({
  blocks: z.array(SessionBlockSchema).min(1).max(8),
});

/** Build a coached session's focus-block plan for a subject + goal. */
export async function generateSessionPlan(params: {
  subject: string;
  goal?: string;
  lengthMinutes: number;
}): Promise<{ blocks: SessionBlock[]; model: string }> {
  const model = modelIdFor("master_coach");
  if (!hasProvider()) {
    return {
      model,
      blocks: [
        {
          topic: params.subject,
          activity: "[stub] AI not configured — set ANTHROPIC_API_KEY to enable real session planning.",
          minutes: params.lengthMinutes,
        },
      ],
    };
  }

  const prompt = [
    `Subject: ${params.subject}`,
    params.goal ? `Student's goal: ${params.goal}` : null,
    `Session length: ${params.lengthMinutes} minutes`,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic(model),
    schema: SessionPlanSchema,
    system: MASTER_COACH_PLAN_PROMPT,
    prompt,
  });
  return { blocks: object.blocks, model };
}

/** One streamed teaching turn (explain -> quiz -> adapt) for a coached block. */
export function streamTeachingMessage(prompt: string): { toTextStreamResponse(): Response } {
  if (!hasProvider()) {
    const stubText = `[stub:master_coach] AI not configured. Set ANTHROPIC_API_KEY to enable real teaching. Prompt was: ${prompt.slice(0, 120)}`;
    return {
      toTextStreamResponse: () =>
        new Response(stubText, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
    };
  }
  return streamText({
    model: anthropic(modelIdFor("master_coach")),
    system: MASTER_COACH_TEACH_PROMPT,
    prompt,
  });
}

const KnowledgeUpdateSchema = z.object({
  concept: z.string(),
  mastery_level: z.number().int().min(1).max(5),
});

const SessionReportSchema = z.object({
  summary: z.string(),
  covered: z.array(z.string()),
  strong_areas: z.array(z.string()),
  weak_areas: z.array(z.string()),
  next_session_suggestion: z.string(),
  knowledge_updates: z.array(KnowledgeUpdateSchema).default([]),
});

export type SessionReport = z.infer<typeof SessionReportSchema>;

/** Generate the end-of-session report + per-concept mastery updates. */
export async function generateSessionReport(params: {
  subject: string;
  blocks: SessionBlock[];
  transcriptText: string;
}): Promise<{ report: SessionReport; model: string }> {
  const model = modelIdFor("master_coach");
  if (!hasProvider()) {
    return {
      model,
      report: {
        summary: "[stub] AI not configured — set ANTHROPIC_API_KEY to enable real session reports.",
        covered: [],
        strong_areas: [],
        weak_areas: [],
        next_session_suggestion: "",
        knowledge_updates: [],
      },
    };
  }

  const prompt = [
    `Subject: ${params.subject}`,
    `Planned blocks: ${params.blocks.map((b) => `${b.topic} (${b.activity})`).join("; ")}`,
    "",
    "Transcript:",
    params.transcriptText,
  ].join("\n");

  const { object } = await generateObject({
    model: anthropic(model),
    schema: SessionReportSchema,
    system: MASTER_COACH_REPORT_PROMPT,
    prompt,
  });
  return { report: object, model };
}
