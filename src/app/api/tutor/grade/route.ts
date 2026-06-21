// POST /api/tutor/grade — grades all 5 Study Quiz answers in one shot and
// returns pass/fail. No credit spend here; the session's 8 credits already
// cover this.
import { NextResponse } from "next/server";
import { requireAuthedSupabase } from "../../_lib/guard";
import { gradeStudyQuiz, type StudyQuizQuestion } from "@/lib/ai";

const PASS_THRESHOLD = 4;

interface GradeRequestBody {
  session_id?: string;
  answers?: string[];
}

export async function POST(req: Request) {
  const body: GradeRequestBody = await req.json().catch(() => ({}));
  const { session_id, answers } = body;

  if (!session_id || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: session } = await supabase
    .from("lesson_plans")
    .select("id, questions, metadata")
    .eq("id", session_id)
    .eq("user_id", userId)
    .eq("action", "study_quiz")
    .single();

  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const questions = (session.questions ?? []) as StudyQuizQuestion[];
  if (questions.length === 0) {
    return NextResponse.json({ error: "quiz_not_generated" }, { status: 400 });
  }

  const metadata = (session.metadata ?? {}) as { subject?: string };
  const grade = await gradeStudyQuiz({
    subject: metadata.subject ?? "General studies",
    questions,
    answers,
  });

  await supabase.from("lesson_attempts").insert(
    questions.map((q, i) => ({
      lesson_id: session_id,
      user_id: userId,
      question_index: i,
      attempt_number: 1,
      answer: answers[i] ?? null,
      ai_grade_result: { correct: grade.results[i]?.correct ?? false, model: grade.model },
      feedback: grade.results[i]?.feedback ?? null,
    }))
  );

  const score = grade.results.filter((r) => r.correct).length;
  const pass = score >= PASS_THRESHOLD;
  const missedTopics = questions.filter((_, i) => !grade.results[i]?.correct).map((q) => q.topic_tag);

  return NextResponse.json({
    ok: true,
    score,
    total: questions.length,
    pass,
    results: grade.results,
    missedTopics,
  });
}
