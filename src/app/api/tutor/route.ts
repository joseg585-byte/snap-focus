// POST /api/tutor — starts a Study Quiz session. Charges the flat 8 credits
// up front (covers the timer + the quiz generated when it ends); the timer
// itself runs client-side, so all this does is reserve a lesson_plans row.
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CREDIT_COSTS } from "@/lib/config";

interface StudyQuizStartBody {
  subject?: string;
  topic?: string;
  length_minutes?: number;
  idempotencyKey?: string;
}

const VALID_LENGTHS = [15, 25, 45];

export async function POST(req: Request) {
  const body: StudyQuizStartBody = await req.json().catch(() => ({}));
  const { subject, topic, length_minutes, idempotencyKey } = body;

  if (!subject || !length_minutes || !VALID_LENGTHS.includes(length_minutes)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const guard = await guardAndSpend("study_quiz", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const title = topic ? `${topic} — ${subject}` : subject;

  const supabase = await createSupabaseServerClient();
  const { data: saved, error: insertError } = await supabase
    .from("lesson_plans")
    .insert({
      user_id: guard.userId,
      action: "study_quiz",
      title,
      content: `Study session: ${title} (${length_minutes} min)`,
      questions: [],
      credits_spent: CREDIT_COSTS.study_quiz,
      metadata: { subject, topic: topic ?? null, lengthMinutes: length_minutes },
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
    sessionId: saved.id,
    subject,
    topic: topic ?? null,
    lengthMinutes: length_minutes,
  });
}
