// POST /api/master-coach — flagship focus coaching. Costs 20 credits.
// Ultimate-tier feature; the credit hard-stop in guardAndSpend enforces access.
import { NextResponse } from "next/server";
import { guardAndSpend } from "../_lib/guard";
import { generateForAction } from "@/lib/ai";

export async function POST(req: Request) {
  const { idempotencyKey, goal } = await req.json().catch(() => ({}));

  const guard = await guardAndSpend("master_coach", idempotencyKey);
  if (guard instanceof NextResponse) return guard;

  const result = await generateForAction(
    "master_coach",
    `Build a personalized focus plan for this goal: ${goal ?? "(no goal provided)"}`
  );

  return NextResponse.json({
    ok: true,
    balance: guard.balance,
    model: result.model,
    plan: result.text,
  });
}
