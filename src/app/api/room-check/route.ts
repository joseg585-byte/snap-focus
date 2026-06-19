// POST /api/room-check — vision check that a room is clean. Costs 1 credit.
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateForAction } from "@/lib/ai";

export async function POST(req: Request) {
  const { idempotencyKey, imageUrl } = await req.json().catch(() => ({}));

  const guard = await guardAndSpend("room_check", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const result = await generateForAction(
    "room_check",
    `Inspect this room photo for cleanliness: ${imageUrl ?? "(no image provided)"}`
  );

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    model: result.model,
    feedback: result.text,
  });
}
