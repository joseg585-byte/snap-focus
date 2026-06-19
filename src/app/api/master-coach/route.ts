// POST /api/master-coach — starts a Master Focus Coach session. Costs 20
// credits upfront (covers the kickoff plan + every check-in + the closing
// reflection — no further spend during the session). Ultimate-tier only;
// enforced here by checking the profile's tier before spending.
import { NextResponse } from "next/server";
import { guardAndSpend, requireAuthedSupabase } from "../_lib/guard";
import { generateForAction } from "@/lib/ai";
import { CREDIT_COSTS } from "@/lib/config";

interface StartRequestBody {
  goal?: string;
  durationMinutes?: 25 | 45 | 90;
  focusLevel?: "light" | "heavy";
  idempotencyKey?: string;
}

export async function POST(req: Request) {
  const body: StartRequestBody = await req.json().catch(() => ({}));
  const { goal, durationMinutes, focusLevel, idempotencyKey } = body;

  if (!goal || !durationMinutes || !focusLevel) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .single();

  if (profile?.tier !== "ultimate") {
    return NextResponse.json(
      { error: "ultimate_required", message: "The Master Focus Coach requires the Ultimate plan." },
      { status: 403 }
    );
  }

  const guard = await guardAndSpend("master_coach", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const result = await generateForAction(
    "master_coach",
    `Build a short kickoff message (3-5 sentences) for a ${durationMinutes}-minute focus session with ${focusLevel} coaching. The user's goal: "${goal}". Clarify the goal in one line, give one concrete first step, and end with an encouraging line.`
  );

  const { data: session, error: insertError } = await supabase
    .from("focus_sessions")
    .insert({
      user_id: userId,
      goal,
      duration_minutes: durationMinutes,
      focus_level: focusLevel,
      transcript: [{ role: "coach", text: result.text, at: new Date().toISOString() }],
      credits_spent: CREDIT_COSTS.master_coach,
    })
    .select("id")
    .single();

  if (insertError || !session) {
    return NextResponse.json(
      { error: "save_failed", message: insertError?.message, balance: guard.balance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    sessionId: session.id,
    kickoff: result.text,
    model: result.model,
  });
}
