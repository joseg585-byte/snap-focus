// Shared guard for AI routes: authenticate, then enforce the HARD credit stop
// BEFORE any AI call. Returns either the spent-balance or a ready-made error
// Response so routes stay tiny.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { spendCredits, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS, type AiAction } from "@/lib/config";

export async function guardAndSpend(
  action: AiAction,
  idempotencyKey?: string
): Promise<{ userId: string; balance: number } | NextResponse> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return NextResponse.json(
      { error: "supabase_not_configured", message: "Set Supabase env vars. See .env.example." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const balance = await spendCredits(user.id, action, idempotencyKey);
    return { userId: user.id, balance };
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // Soft fallback hint: if they can't afford the flagship coach, suggest
      // the cheaper Tutor so they can still spend their remaining balance.
      return NextResponse.json(
        {
          error: "insufficient_credits",
          action,
          cost: CREDIT_COSTS[action],
          suggestion:
            action === "master_coach"
              ? "Not enough credits for the Master Coach — try the Standard Tutor (2 credits) or top up."
              : "Not enough credits — top up to continue.",
        },
        { status: 402 }
      );
    }
    throw err;
  }
}
