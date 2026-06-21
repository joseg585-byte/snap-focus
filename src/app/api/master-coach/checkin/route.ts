// POST /api/master-coach/checkin — one streamed turn during an active
// session. No extra credit spend; covered by the session's upfront cost.
// Branches on the session's stored `mode`:
//  - "coached": the AI actually teaches the current block (explain -> quiz
//    -> adapt), informed by the student's stored study_knowledge.
//  - "just_focus": a plain Pomodoro accountability check-in (unchanged).
import { NextResponse } from "next/server";
import { streamCoachMessage, streamTeachingMessage } from "@/lib/ai";
import { requireAuthedSupabase } from "../../_lib/guard";

interface CheckinRequestBody {
  sessionId?: string;
  // just_focus fields
  goal?: string;
  focusLevel?: "light" | "heavy";
  elapsedMinutes?: number;
  userResponse?: string;
  // coached fields
  blockIndex?: number;
  userMessage?: string;
}

interface SessionBlock {
  topic: string;
  activity: string;
  minutes: number;
}

export async function POST(req: Request) {
  const body: CheckinRequestBody = await req.json().catch(() => ({}));
  const { sessionId } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: session } = await supabase
    .from("focus_sessions")
    .select("id, mode, subject, goal, focus_level, session_plan")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (session.mode === "coached") {
    const { blockIndex, userMessage } = body;
    const blocks = (session.session_plan ?? []) as SessionBlock[];
    const block = blocks[blockIndex ?? 0];
    if (!block) return NextResponse.json({ error: "invalid_block_index" }, { status: 400 });

    let knowledgeContext = "No prior knowledge on record for this subject yet.";
    const { data: topic } = await supabase
      .from("study_topics")
      .select("id")
      .eq("user_id", userId)
      .ilike("subject", session.subject ?? "")
      .maybeSingle();

    if (topic) {
      const { data: knowledge } = await supabase
        .from("study_knowledge")
        .select("concept, mastery_level")
        .eq("topic_id", topic.id)
        .order("mastery_level", { ascending: true });
      if (knowledge && knowledge.length > 0) {
        knowledgeContext = knowledge
          .map((k) => `${k.concept}: mastery ${k.mastery_level}/5`)
          .join("; ");
      }
    }

    const prompt = [
      `Subject: ${session.subject}`,
      `Current block topic: ${block.topic}`,
      `Block activity: ${block.activity}`,
      `Known mastery levels: ${knowledgeContext}`,
      userMessage
        ? `The student just said: "${userMessage}"`
        : "This is the start of the block — begin teaching it.",
    ].join("\n");

    return streamTeachingMessage(prompt).toTextStreamResponse();
  }

  // ---------- just_focus ----------
  const { goal, focusLevel, elapsedMinutes, userResponse } = body;
  const effectiveGoal = goal ?? session.goal;
  const effectiveFocusLevel = focusLevel ?? (session.focus_level as "light" | "heavy");

  const prompt = userResponse
    ? `Minute ${elapsedMinutes ?? "?"} of the session. Goal: "${effectiveGoal}". Coaching level: ${effectiveFocusLevel}. The user just replied to your last check-in with: "${userResponse}". Respond with ${effectiveFocusLevel === "heavy" ? "direct, energetic" : "brief, gentle"} coaching (2-3 sentences) that adapts to what they said.`
    : `Minute ${elapsedMinutes ?? "?"} of the session. Goal: "${effectiveGoal}". Coaching level: ${effectiveFocusLevel}. Send a short check-in (1-2 sentences): ask how it's going and whether they're stuck on anything. ${effectiveFocusLevel === "heavy" ? "Be energetic and direct." : "Be gentle and brief."}`;

  return streamCoachMessage(prompt).toTextStreamResponse();
}
