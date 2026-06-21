// POST /api/master-coach/end — closes a session.
//  - "coached": generates the end-of-session report (covered, strong/weak
//    areas, next-session suggestion, per-concept mastery), saves it to
//    focus_sessions.end_report, and persists study_topics/study_knowledge so
//    the next coached session on this subject starts smarter.
//  - "just_focus": unchanged — a short reflection summary.
import { NextResponse } from "next/server";
import { generateForAction, generateSessionReport } from "@/lib/ai";
import { requireAuthedSupabase } from "../../_lib/guard";

interface TranscriptEntry {
  role: "coach" | "user";
  text: string;
  at: string;
}

interface SessionBlock {
  topic: string;
  activity: string;
  minutes: number;
}

interface EndRequestBody {
  sessionId?: string;
  transcript?: TranscriptEntry[];
}

export async function POST(req: Request) {
  const body: EndRequestBody = await req.json().catch(() => ({}));
  const { sessionId, transcript } = body;

  if (!sessionId || !transcript) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: session } = await supabase
    .from("focus_sessions")
    .select("id, mode, subject, goal, session_plan")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();

  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const transcriptText = transcript
    .map((t) => `${t.role === "coach" ? "Coach" : "User"}: ${t.text}`)
    .join("\n");

  if (session.mode === "coached" && session.subject) {
    const blocks = (session.session_plan ?? []) as SessionBlock[];
    const { report, model } = await generateSessionReport({
      subject: session.subject,
      blocks,
      transcriptText,
    });

    const { error: updateError } = await supabase
      .from("focus_sessions")
      .update({ transcript, end_report: report, completed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId);

    if (updateError) {
      return NextResponse.json({ error: "save_failed", message: updateError.message }, { status: 500 });
    }

    // Find-or-create the study_topics row for this subject (case-insensitive)
    // and persist mastery updates so the next session starts smarter.
    let topicId: string;
    const { data: existingTopic } = await supabase
      .from("study_topics")
      .select("id")
      .eq("user_id", userId)
      .ilike("subject", session.subject)
      .maybeSingle();

    if (existingTopic) {
      topicId = existingTopic.id;
      await supabase
        .from("study_topics")
        .update({ last_studied_at: new Date().toISOString() })
        .eq("id", topicId);
    } else {
      const { data: newTopic } = await supabase
        .from("study_topics")
        .insert({ user_id: userId, subject: session.subject })
        .select("id")
        .single();
      topicId = newTopic!.id;
    }

    for (const update of report.knowledge_updates) {
      const { data: existingConcept } = await supabase
        .from("study_knowledge")
        .select("id, attempts")
        .eq("topic_id", topicId)
        .ilike("concept", update.concept)
        .maybeSingle();

      if (existingConcept) {
        await supabase
          .from("study_knowledge")
          .update({
            mastery_level: update.mastery_level,
            last_practiced_at: new Date().toISOString(),
            attempts: existingConcept.attempts + 1,
          })
          .eq("id", existingConcept.id);
      } else {
        await supabase.from("study_knowledge").insert({
          user_id: userId,
          topic_id: topicId,
          concept: update.concept,
          mastery_level: update.mastery_level,
          attempts: 1,
        });
      }
    }

    return NextResponse.json({ ok: true, mode: "coached", report, model });
  }

  // ---------- just_focus ----------
  const result = await generateForAction(
    "master_coach",
    `The focus session is ending. Goal was: "${session.goal}". Here is the full transcript:\n\n${transcriptText}\n\nWrite a short reflection summary (3-5 sentences): what went well, what to watch for, and one concrete suggestion for the next session.`
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

  return NextResponse.json({ ok: true, mode: "just_focus", reflection: result.text });
}
