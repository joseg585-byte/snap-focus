// =============================================================
// AI routing layer (Vercel AI SDK).
// Maps each action to a model class per tier policy:
//   - budget models for the 3 kid tools (Clean Check / Homework Check / Study Quiz)
//   - a flagship model for the (demoted) adult Master Study Coach
// Model ids are read from env so they can be tuned without code changes.
// =============================================================
import "server-only";
import { generateText, generateObject, streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { AiAction, CleanCheckLevel } from "@/lib/config";
import {
  PROMPTS,
  CLEAN_CHECK_PROMPT,
  CLEAN_CHECK_STRICTNESS,
  CLEAN_CHECK_AREA_GUIDANCE,
  HOMEWORK_CHECK_PROMPT,
  STUDY_QUIZ_GENERATE_PROMPT,
  STUDY_QUIZ_GRADE_PROMPT,
  MASTER_COACH_PLAN_PROMPT,
  MASTER_COACH_TEACH_PROMPT,
  MASTER_COACH_REPORT_PROMPT,
} from "./prompts";

export type ModelClass = "budget" | "flagship";

export const ACTION_MODEL_CLASS: Record<AiAction, ModelClass> = {
  clean_check: "budget",
  homework_check: "budget",
  study_quiz: "budget",
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
 * Generic text generation, currently only used for the Master Focus Coach's
 * "Just Focus" kickoff message. Falls back to a deterministic stub when no
 * provider key is configured, so routes stay testable without live creds.
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
// Clean Check vision verdicts (renamed from Room Check, area-aware)
// =============================================================

export const CleanCheckVerdictSchema = z.object({
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

export type CleanCheckVerdict = z.infer<typeof CleanCheckVerdictSchema>;

export interface CleanCheckImage {
  /** Base64-encoded image bytes, no `data:` URL prefix. */
  base64: string;
  mediaType: string;
  areaTitle: string;
}

/**
 * Send 1-4 photos of a declared area (bedroom, closet, desk, etc.) to Claude
 * vision in a single message and get back a structured per-photo + overall
 * verdict. Falls back to an honest stub (never a fake "pass") when no
 * provider key is configured.
 */
export async function generateCleanCheckVerdict(params: {
  level: CleanCheckLevel;
  area: string;
  images: CleanCheckImage[];
}): Promise<CleanCheckVerdict & { model: string }> {
  const model = modelIdFor("clean_check");

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

  const areaGuidance =
    CLEAN_CHECK_AREA_GUIDANCE[params.area.toLowerCase()] ?? CLEAN_CHECK_AREA_GUIDANCE.other;
  const instructions = `${CLEAN_CHECK_PROMPT}\n\nArea being checked: ${params.area}. ${areaGuidance}\n\n${CLEAN_CHECK_STRICTNESS[params.level]}\n\nThere are ${params.images.length} photo(s) below, each preceded by a text label naming its shot. Return exactly ${params.images.length} entries in "areas", in the same order as the labels, using each label as the "title".`;

  const { object } = await generateObject({
    model: anthropic(model),
    schema: CleanCheckVerdictSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instructions },
          ...params.images.flatMap((img) => [
            { type: "text" as const, text: `Shot: ${img.areaTitle}` },
            { type: "image" as const, image: img.base64, mediaType: img.mediaType },
          ]),
        ],
      },
    ],
  });

  return { ...object, model };
}

// =============================================================
// Homework Check — verify it's homework, complete, and spot-check accuracy
// =============================================================

export const HomeworkCheckVerdictSchema = z.object({
  verdict: z.enum(["pass", "fail", "not_homework"]),
  feedback: z.string().describe("Short, kind, specific feedback readable by a kid"),
  issues: z
    .array(
      z.object({
        question_ref: z.string().describe("Which question/problem this issue refers to"),
        issue: z.string().describe("What looks off about it"),
      })
    )
    .default([]),
});

export type HomeworkCheckVerdict = z.infer<typeof HomeworkCheckVerdictSchema>;

export interface HomeworkCheckImage {
  base64: string;
  mediaType: string;
}

/** Send one homework photo to Claude vision and get back a verdict. */
export async function generateHomeworkVerdict(params: {
  image: HomeworkCheckImage;
}): Promise<HomeworkCheckVerdict & { model: string }> {
  const model = modelIdFor("homework_check");

  if (!hasProvider()) {
    return {
      model,
      verdict: "fail",
      feedback: "AI not configured — set ANTHROPIC_API_KEY to enable real verification.",
      issues: [],
    };
  }

  const { object } = await generateObject({
    model: anthropic(model),
    schema: HomeworkCheckVerdictSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: HOMEWORK_CHECK_PROMPT },
          { type: "image" as const, image: params.image.base64, mediaType: params.image.mediaType },
        ],
      },
    ],
  });

  return { ...object, model };
}

// =============================================================
// Study Quiz — generate a 5-question verification quiz + grade it
// =============================================================

const StudyQuizQuestionSchema = z.object({
  prompt: z.string().describe("The question text shown to the student"),
  correct_answer: z.string().describe("The single correct final answer"),
  topic_tag: z.string().describe("Short name of the specific concept this question tests"),
});

export type StudyQuizQuestion = z.infer<typeof StudyQuizQuestionSchema>;

const StudyQuizSchema = z.object({
  questions: z.array(StudyQuizQuestionSchema).length(5),
});

/** Generate the 5-question verification quiz for a subject/topic. */
export async function generateStudyQuiz(params: {
  subject: string;
  topic?: string;
}): Promise<{ questions: StudyQuizQuestion[]; model: string }> {
  const model = modelIdFor("study_quiz");
  if (!hasProvider()) {
    return {
      model,
      questions: Array.from({ length: 5 }, (_, i) => ({
        prompt: `[stub ${i + 1}] AI not configured. Set ANTHROPIC_API_KEY to enable real quiz generation.`,
        correct_answer: "N/A",
        topic_tag: "N/A",
      })),
    };
  }

  const prompt = [`Subject: ${params.subject}`, params.topic ? `Topic: ${params.topic}` : null]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic(model),
    schema: StudyQuizSchema,
    system: STUDY_QUIZ_GENERATE_PROMPT,
    prompt,
  });
  return { questions: object.questions, model };
}

const StudyQuizGradeResultSchema = z.object({
  results: z
    .array(
      z.object({
        correct: z.boolean(),
        feedback: z.string().describe("Short, kind, specific feedback readable by a kid"),
      })
    )
    .describe("Same order as the submitted questions"),
});

export type StudyQuizGradeResult = z.infer<typeof StudyQuizGradeResultSchema>["results"];

/** Grade all 5 quiz answers in a single call. */
export async function gradeStudyQuiz(params: {
  subject: string;
  questions: StudyQuizQuestion[];
  answers: string[];
}): Promise<{ results: StudyQuizGradeResult; model: string }> {
  const model = modelIdFor("study_quiz");
  if (!hasProvider()) {
    return {
      model,
      results: params.questions.map(() => ({
        correct: false,
        feedback: "[stub] AI not configured — set ANTHROPIC_API_KEY to enable real grading.",
      })),
    };
  }

  const prompt = [
    `Subject: ${params.subject}`,
    "",
    ...params.questions.map(
      (q, i) =>
        `Q${i + 1}: ${q.prompt}\nCorrect answer: ${q.correct_answer}\nTopic: ${q.topic_tag}\nStudent's answer: ${params.answers[i] ?? "(no answer)"}`
    ),
  ].join("\n\n");

  const { object } = await generateObject({
    model: anthropic(model),
    schema: StudyQuizGradeResultSchema,
    system: STUDY_QUIZ_GRADE_PROMPT,
    prompt,
  });
  return { results: object.results, model };
}

// =============================================================
// Master Focus Coach — coached subject study sessions (demoted, unchanged)
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
