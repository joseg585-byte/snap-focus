// POST /api/tutor/quiz — generates (or replays) the 5-question verification
// quiz for a Study Quiz session. No credit spend here; the session's 8
// credits already cover this.
import { NextResponse } from "next/server";
import { requireAuthedSupabase } from "../../_lib/guard";
import { generateStudyQuiz, type StudyQuizQuestion } from "@/lib/ai";

interface QuizRequestBody {
  session_id?: string;
}

export async function POST(req: Request) {
  const body: QuizRequestBody = await req.json().catch(() => ({}));
  const { session_id } = body;

  if (!session_id) {
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

  const metadata = (session.metadata ?? {}) as { subject?: string; topic?: string };
  let questions = (session.questions ?? []) as StudyQuizQuestion[];

  if (questions.length === 0) {
    const result = await generateStudyQuiz({
      subject: metadata.subject ?? "General studies",
      topic: metadata.topic,
    });
    questions = result.questions;
    await supabase.from("lesson_plans").update({ questions }).eq("id", session_id);
  }

  return NextResponse.json({
    ok: true,
    questions: questions.map((q) => ({ prompt: q.prompt, topic_tag: q.topic_tag })),
  });
}
