// POST /api/master-coach/end — closes a session: generates a reflection +
// next-session suggestions, then persists the full transcript.
import { NextResponse } from "next/server";
import { generateForAction } from "@/lib/ai";
import { requireAuthedSupabase } from "../../_lib/guard";

interface TranscriptEntry {
  role: "coach" | "user";
  text: string;
  at: string;
}

interface EndRequestBody {
  sessionId?: string;
  goal?: string;
  transcript?: TranscriptEntry[];
}

export async function POST(req: Request) {
  const body: EndRequestBody = await req.json().catch(() => ({}));
  const { sessionId, goal, transcript } = body;

  if (!sessionId || !goal || !transcript) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const transcriptText = transcript
    .map((t) => `${t.role === "coach" ? "Coach" : "User"}: ${t.text}`)
    .join("\n");

  const result = await generateForAction(
    "master_coach",
    `The focus session is ending. Goal was: "${goal}". Here is the full transcript:\n\n${transcriptText}\n\nWrite a short reflection summary (3-5 sentences): what went well, what to watch for, and one concrete suggestion for the next session.`
  );

  const { error: updateError } = await supabase
    .from("focus_sessions")
    .update({
      transcript,
      reflection: result.text,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: "save_failed", message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reflection: result.text });
}
