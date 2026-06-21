// POST /api/master-coach — starts a Master Focus Coach session, either:
//  - "coached": AI builds a subject study plan (session_plan), then teaches
//    through it block by block in /checkin. 10 credits upfront.
//  - "just_focus": today's plain Pomodoro + accountability check-ins, no
//    subject content. 5 credits upfront.
// Ultimate-tier only; enforced here by checking the profile's tier before
// spending. Either way, the whole session's cost is paid upfront — no
// further spend during check-ins or at the end.
import { NextResponse } from "next/server";
import { guardAndSpend, requireAuthedSupabase } from "../_lib/guard";
import { generateForAction, generateSessionPlan } from "@/lib/ai";
import { CREDIT_COSTS, MASTER_COACH_JUST_FOCUS_COST } from "@/lib/config";

interface StartRequestBody {
  mode?: "coached" | "just_focus";
  subject?: string;
  goal?: string;
  lengthMinutes?: 25 | 45 | 90;
  focusLevel?: "light" | "heavy";
  idempotencyKey?: string;
}

export async function POST(req: Request) {
  const body: StartRequestBody = await req.json().catch(() => ({}));
  const { mode, subject, goal, lengthMinutes, focusLevel, idempotencyKey } = body;

  if (!mode || !lengthMinutes) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (mode === "coached" && !subject) {
    return NextResponse.json({ error: "missing_fields", message: "Coached sessions need a subject." }, { status: 400 });
  }
  if (mode === "just_focus" && !goal) {
    return NextResponse.json({ error: "missing_fields", message: "Just Focus sessions need a goal." }, { status: 400 });
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

  const cost = mode === "coached" ? CREDIT_COSTS.master_coach : MASTER_COACH_JUST_FOCUS_COST;
  const guard = await guardAndSpend("master_coach", idempotencyKey, cost);
  if (guard instanceof NextResponse) return guard;

  if (mode === "coached") {
    const plan = await generateSessionPlan({ subject: subject!, goal, lengthMinutes });

    const { data: session, error: insertError } = await supabase
      .from("focus_sessions")
      .insert({
        user_id: userId,
        goal: goal ?? subject,
        duration_minutes: lengthMinutes,
        focus_level: "light", // unused in coached mode; column is NOT NULL
        mode: "coached",
        subject,
        session_plan: plan.blocks,
        transcript: [],
        credits_spent: cost,
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
      mode: "coached",
      subject,
      blocks: plan.blocks,
      model: plan.model,
    });
  }

  // ---------- just_focus ----------
  const result = await generateForAction(
    "master_coach",
    `Build a short kickoff message (3-5 sentences) for a ${lengthMinutes}-minute focus session with ${focusLevel ?? "light"} coaching. The user's goal: "${goal}". Clarify the goal in one line, give one concrete first step, and end with an encouraging line.`
  );

  const { data: session, error: insertError } = await supabase
    .from("focus_sessions")
    .insert({
      user_id: userId,
      goal,
      duration_minutes: lengthMinutes,
      focus_level: focusLevel ?? "light",
      mode: "just_focus",
      session_plan: [],
      transcript: [{ role: "coach", text: result.text, at: new Date().toISOString() }],
      credits_spent: cost,
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
    mode: "just_focus",
    kickoff: result.text,
    model: result.model,
  });
}
