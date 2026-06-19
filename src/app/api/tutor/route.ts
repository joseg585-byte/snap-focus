// POST /api/tutor — customized lesson plan / quiz / study guide. Costs 2
// credits. Auto-saves the generation to lesson_plans so the credits spent
// are never lost even if the user never clicks "Save to My Library".
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateForAction } from "@/lib/ai";
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
    "Produce a well-structured markdown document matching the goal above.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateForAction("standard_tutor", prompt);

  const title = `${topic} — ${subject} (${gradeLevel})`;
  const supabase = await createSupabaseServerClient();
  const { data: saved, error: insertError } = await supabase
    .from("lesson_plans")
    .insert({
      user_id: guard.userId,
      action: "standard_tutor",
      title,
      content: result.text,
      model_used: result.model,
      credits_spent: CREDIT_COSTS.standard_tutor,
      metadata: { subject, gradeLevel, goal, notes: notes ?? null },
    })
    .select("id")
    .single();

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    model: result.model,
    plan: result.text,
    title,
    savedId: insertError ? null : saved?.id ?? null,
  });
}
