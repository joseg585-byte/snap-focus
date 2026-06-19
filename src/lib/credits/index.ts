// =============================================================
// Credit layer — server-only wrappers around the Postgres RPCs.
// The client NEVER does credit math; these call the SECURITY DEFINER
// functions (spend_credits / grant_credits) which lock the row and
// enforce the hard stop atomically.
// =============================================================
import "server-only";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { CREDIT_COSTS, type AiAction } from "@/lib/config";

export class InsufficientCreditsError extends Error {
  constructor(public readonly action: AiAction, public readonly cost: number) {
    super(`insufficient_credits: ${action} needs ${cost}`);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Atomically spend credits for an AI action. Returns the new balance.
 * `idempotencyKey` (e.g. a request id) makes retries safe.
 * Throws InsufficientCreditsError on a hard stop.
 */
export async function spendCredits(
  userId: string,
  action: AiAction,
  idempotencyKey?: string
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("spend_credits", {
    p_user_id: userId,
    p_action: action,
    p_idem_key: idempotencyKey ?? null,
  });

  if (error) {
    if (error.message?.includes("insufficient_credits")) {
      throw new InsufficientCreditsError(action, CREDIT_COSTS[action]);
    }
    throw error;
  }
  return data as number;
}

/**
 * Grant credits (monthly renewal, upgrade reset-to-max, top-up). Idempotent
 * via `idempotencyKey` (Stripe event id). Runs with the service role because
 * grants originate from trusted server contexts (webhooks / cron), not users.
 */
export async function grantCredits(args: {
  userId: string;
  amount: number;
  reason: "monthly_grant" | "topup_purchase" | "admin_adjustment" | "refund";
  idempotencyKey?: string;
  /** true = set balance absolutely (mid-month upgrade reset-to-max). */
  setAbsolute?: boolean;
}): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("grant_credits", {
    p_user_id: args.userId,
    p_amount: args.amount,
    p_reason: args.reason,
    p_idem_key: args.idempotencyKey ?? null,
    p_set_absolute: args.setAbsolute ?? false,
  });
  if (error) throw error;
  return data as number;
}
