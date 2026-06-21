// POST /api/tutor/grade — grades one attempt at one question of an already-
// generated lesson. No credit spend here; the lesson's 12 credits already
// cover unlimited grading up to the 3-attempt cap enforced below.
import { NextResponse } from "next/server";
import { requireAuthedSupabase } from "../../_lib/guard";
import { gradeTutorAnswer, type TutorQuestion } from "@/lib/ai";

const MAX_ATTEMPTS = 3;

interface GradeRequestBody {
  lesson_id?: string;
  question_index?: number;
  work_shown?: string;
  answer?: string;
}

export async function POST(req: Request) {
  const body: GradeRequestBody = await req.json().catch(() => ({}));
  const { lesson_id, question_index, work_shown, answer } = body;

  if (!lesson_id || question_index === undefined || !answer) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: lesson } = await supabase
    .from("lesson_plans")
    .select("id, questions")
    .eq("id", lesson_id)
    .eq("user_id", userId)
    .eq("action", "standard_tutor")
    .single();

  if (!lesson) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const questions = (lesson.questions ?? []) as TutorQuestion[];
  const question = questions[question_index];
  if (!question) {
    return NextResponse.json({ error: "invalid_question_index" }, { status: 400 });
  }

  const { count: priorAttempts } = await supabase
    .from("lesson_attempts")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lesson_id)
    .eq("question_index", question_index);

  const attemptNumber = (priorAttempts ?? 0) + 1;

  if (attemptNumber > MAX_ATTEMPTS) {
    return NextResponse.json({
      ok: true,
      verdict: "blocked",
      feedback: "You've used all 3 tries for this question — let's get a parent to help.",
      attempts_remaining: 0,
      escalate_to_parent: true,
    });
  }

  const grade = await gradeTutorAnswer({
    question: question.prompt,
    correctAnswer: question.correct_answer,
    solutionPath: question.solution_path,
    workShown: work_shown ?? "",
    answer,
  });

  const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptNumber);
  const escalateToParent = !grade.correct && (attemptNumber >= 2 || attemptsRemaining === 0);

  await supabase.from("lesson_attempts").insert({
    lesson_id,
    user_id: userId,
    question_index,
    attempt_number: attemptNumber,
    work_shown: work_shown ?? null,
    answer,
    ai_grade_result: { correct: grade.correct, model: grade.model },
    feedback: grade.feedback,
  });

  return NextResponse.json({
    ok: true,
    verdict: grade.correct ? "correct" : "incorrect",
    feedback: grade.feedback,
    attempts_remaining: attemptsRemaining,
    escalate_to_parent: escalateToParent,
  });
}
