// Shared guard for AI routes: authenticate, then enforce the HARD credit stop
// BEFORE any AI call. Returns either the spent-balance or a ready-made error
// Response so routes stay tiny.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { spendCredits, InsufficientCreditsError } from "@/lib/credits";
import { CREDIT_COSTS, type AiAction } from "@/lib/config";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Shared by routes that need an authenticated user but don't spend credits
 * (Master Coach check-in/end, Stripe checkout). Turns "Supabase not
 * configured" and "not logged in" into clean JSON responses instead of an
 * uncaught 500.
 */
export async function requireAuthedSupabase(): Promise<
  { supabase: SupabaseServerClient; userId: string } | NextResponse
> {
  let supabase: SupabaseServerClient;
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

  return { supabase, userId: user.id };
}

export async function guardAndSpend(
  action: AiAction,
  idempotencyKey?: string,
  costOverride?: number
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
    const balance = await spendCredits(user.id, action, idempotencyKey, costOverride);
    return { userId: user.id, balance };
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      // Soft fallback hint: if they can't afford the flagship coach, suggest
      // the cheaper Tutor so they can still spend their remaining balance.
      return NextResponse.json(
        {
          error: "insufficient_credits",
          action,
          cost: costOverride ?? CREDIT_COSTS[action],
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
