// POST /api/master-coach/checkin — a single streamed check-in during an
// active session. No extra credit spend; covered by the session's upfront
// 20 credits. Verifies the session belongs to the caller before streaming.
import { NextResponse } from "next/server";
import { streamCoachMessage } from "@/lib/ai";
import { requireAuthedSupabase } from "../../_lib/guard";

interface CheckinRequestBody {
  sessionId?: string;
  goal?: string;
  focusLevel?: "light" | "heavy";
  elapsedMinutes?: number;
  userResponse?: string;
}

export async function POST(req: Request) {
  const body: CheckinRequestBody = await req.json().catch(() => ({}));
  const { sessionId, goal, focusLevel, elapsedMinutes, userResponse } = body;

  if (!sessionId || !goal) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: session } = await supabase
    .from("focus_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const prompt = userResponse
    ? `Minute ${elapsedMinutes ?? "?"} of the session. Goal: "${goal}". Coaching level: ${focusLevel}. The user just replied to your last check-in with: "${userResponse}". Respond with ${focusLevel === "heavy" ? "direct, energetic" : "brief, gentle"} coaching (2-3 sentences) that adapts to what they said.`
    : `Minute ${elapsedMinutes ?? "?"} of the session. Goal: "${goal}". Coaching level: ${focusLevel}. Send a short check-in (1-2 sentences): ask how it's going and whether they're stuck on anything. ${focusLevel === "heavy" ? "Be energetic and direct." : "Be gentle and brief."}`;

  return streamCoachMessage(prompt).toTextStreamResponse();
}
