// POST /api/room-check — vision-verified room check. Cost depends on level
// (quick=1, standard=2, deep=3 credits), enforced server-side regardless of
// what the client claims.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateRoomCheckVerdict, type RoomCheckImage } from "@/lib/ai";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roomCheckLevelConfig, type RoomCheckLevel } from "@/lib/config";

interface RoomCheckRequestBody {
  level?: RoomCheckLevel;
  photos?: string[]; // data: URLs, one per wizard step, in order
  idempotencyKey?: string;
}

function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

export async function POST(req: Request) {
  const body: RoomCheckRequestBody = await req.json().catch(() => ({}));
  const { level, photos, idempotencyKey } = body;

  if (!level || !["quick", "standard", "deep"].includes(level)) {
    return NextResponse.json({ error: "invalid_level" }, { status: 400 });
  }

  const config = roomCheckLevelConfig(level);

  if (!Array.isArray(photos) || photos.length !== config.photoCount) {
    return NextResponse.json(
      { error: "wrong_photo_count", expected: config.photoCount, got: photos?.length ?? 0 },
      { status: 400 }
    );
  }

  const parsed = photos.map(parseDataUrl);
  if (parsed.some((p) => p === null)) {
    return NextResponse.json({ error: "invalid_photo_data" }, { status: 400 });
  }

  const guard = await guardAndSpend("room_check", idempotencyKey, config.cost);
  if (guard instanceof NextResponse) return guard;

  const images: RoomCheckImage[] = parsed.map((p, i) => ({
    base64: p!.base64,
    mediaType: p!.mediaType,
    areaTitle: config.steps[i].title,
  }));

  let verdict;
  try {
    verdict = await generateRoomCheckVerdict({ level, images });
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

  const roomCheckId = randomUUID();
  const supabase = await createSupabaseServerClient();

  const storagePaths: string[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const { base64, mediaType } = parsed[i]!;
    const ext = mediaType.split("/")[1] || "jpg";
    const path = `${guard.userId}/${roomCheckId}/${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("room-checks")
      .upload(path, Buffer.from(base64, "base64"), { contentType: mediaType });
    if (!uploadError) storagePaths.push(path);
  }

  const { error: insertError } = await supabase.from("room_checks").insert({
    id: roomCheckId,
    user_id: guard.userId,
    level,
    storage_paths: storagePaths,
    area_results: verdict.areas,
    overall_pass: verdict.overallPass,
    is_clean: verdict.overallPass,
    ai_feedback: verdict.summary,
    credits_spent: config.cost,
  });

  if (insertError) {
    return NextResponse.json(
      { error: "save_failed", message: insertError.message, balance: guard.balance },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: roomCheckId,
    balance: guard.balance,
    model: verdict.model,
    level,
    overallPass: verdict.overallPass,
    summary: verdict.summary,
    areas: verdict.areas,
  });
}
