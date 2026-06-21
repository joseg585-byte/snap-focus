// POST /api/tutor — generates a graded practice lesson (3-7 questions, each
// with its own correct answer + solution path). Costs 12 credits, charged on
// generation — that covers all grading + retries for this lesson, so
// /api/tutor/grade never spends credits itself.
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateTutorLesson } from "@/lib/ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CREDIT_COSTS } from "@/lib/config";

interface TutorRequestBody {
  subject?: string;
  gradeLevel?: string;
  topic?: string;
  goal?: "learn_concept" | "practice_problems" | "test_prep" | "quick_reference";
  notes?: string;
  idempotencyKey?: string;
}

const GOAL_LABEL: Record<string, string> = {
  learn_concept: "Learn the concept",
  practice_problems: "Practice problems",
  test_prep: "Test prep",
  quick_reference: "Quick reference",
};

export async function POST(req: Request) {
  const body: TutorRequestBody = await req.json().catch(() => ({}));
  const { subject, gradeLevel, topic, goal, notes, idempotencyKey } = body;

  if (!subject || !gradeLevel || !topic || !goal) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const guard = await guardAndSpend("standard_tutor", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const goalLabel = GOAL_LABEL[goal] ?? goal;
  const prompt = [
    `Subject: ${subject}`,
    `Grade level: ${gradeLevel}`,
    `Topic: ${topic}`,
    `Goal: ${goalLabel}`,
    notes ? `Special needs / notes: ${notes}` : null,
    "",
    "Generate the practice question set described in the system prompt.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateTutorLesson(prompt);

  const title = `${topic} — ${subject} (${gradeLevel})`;
  const content = result.questions
    .map((q, i) => `${i + 1}. ${q.prompt}`)
    .join("\n\n");

  const supabase = await createSupabaseServerClient();
  const { data: saved, error: insertError } = await supabase
    .from("lesson_plans")
    .insert({
      user_id: guard.userId,
      action: "standard_tutor",
      title,
      content,
      questions: result.questions,
      model_used: result.model,
      credits_spent: CREDIT_COSTS.standard_tutor,
      metadata: { subject, gradeLevel, goal, notes: notes ?? null },
    })
    .select("id")
    .single();

  if (insertError || !saved) {
    return NextResponse.json(
      { error: "save_failed", message: insertError?.message, balance: guard.balance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    model: result.model,
    lessonId: saved.id,
    title,
    questions: result.questions.map((q) => ({ prompt: q.prompt })),
  });
}
