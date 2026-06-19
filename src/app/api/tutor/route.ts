// POST /api/tutor — customized lesson plan. Costs 2 credits.
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateForAction } from "@/lib/ai";

export async function POST(req: Request) {
  const { idempotencyKey, topic, gradeLevel } = await req.json().catch(() => ({}));

  const guard = await guardAndSpend("standard_tutor", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const result = await generateForAction(
    "standard_tutor",
    `Build a lesson plan on "${topic ?? "study skills"}" for grade ${gradeLevel ?? "unspecified"}.`
  );

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    model: result.model,
    plan: result.text,
  });
}
