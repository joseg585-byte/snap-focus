// POST /api/homework-check — vision-verified homework check. Flat 3 credits,
// charged before the AI call regardless of the verdict (a "not_homework" or
// "fail" result is still a real verification, not a freebie).
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateHomeworkVerdict } from "@/lib/ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TOOL_CREDIT_COSTS } from "@/lib/credits/costs";

interface HomeworkCheckRequestBody {
  photo?: string; // data: URL
  idempotencyKey?: string;
}

function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function POST(req: Request) {
  const body: HomeworkCheckRequestBody = await req.json().catch(() => ({}));
  const { photo, idempotencyKey } = body;

  if (!photo) {
    return NextResponse.json({ error: "missing_photo" }, { status: 400 });
  }

  const parsed = parseDataUrl(photo);
  if (!parsed) {
    return NextResponse.json({ error: "invalid_photo_data" }, { status: 400 });
  }

  const cost = TOOL_CREDIT_COSTS.homework_check;
  const guard = await guardAndSpend("homework_check", idempotencyKey, cost);
  if (guard instanceof NextResponse) return guard;

  let verdict;
  try {
    verdict = await generateHomeworkVerdict({ image: parsed });
  } catch (err) {
    return NextResponse.json(
      {
        error: "ai_generation_failed",
        message: err instanceof Error ? err.message : "Unknown error",
        balance: guard.balance,
      },
      { status: 502 }
    );
  }

  const homeworkCheckId = randomUUID();
  const supabase = await createSupabaseServerClient();

  const ext = parsed.mediaType.split("/")[1] || "jpg";
  const storagePath = `${guard.userId}/${homeworkCheckId}.${ext}`;
  await supabase.storage
    .from("homework-checks")
    .upload(storagePath, Buffer.from(parsed.base64, "base64"), { contentType: parsed.mediaType });

  const { error: insertError } = await supabase.from("homework_checks").insert({
    id: homeworkCheckId,
    user_id: guard.userId,
    storage_path: storagePath,
    verdict: verdict.verdict,
    ai_feedback: verdict.feedback,
    issues: verdict.issues,
    credits_spent: cost,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "save_failed", message: insertError.message, balance: guard.balance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: homeworkCheckId,
    balance: guard.balance,
    model: verdict.model,
    verdict: verdict.verdict,
    feedback: verdict.feedback,
    issues: verdict.issues,
  });
}
