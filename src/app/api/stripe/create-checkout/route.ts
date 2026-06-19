// POST /api/stripe/create-checkout — starts a Stripe Checkout session for
// either a subscription tier change or a credit top-up pack.
import { NextResponse } from "next/server";
import { requireAuthedSupabase } from "../../_lib/guard";
import { getBillingService } from "@/lib/billing";
import { TIERS, TOPUP_PACKS, type TierId, type TopupId } from "@/lib/config";

interface CreateCheckoutBody {
  kind?: "subscription" | "topup";
  tier?: TierId;
  pack?: TopupId;
}

export async function POST(req: Request) {
  const body: CreateCheckoutBody = await req.json().catch(() => ({}));
  const { kind, tier, pack } = body;

  const authed = await requireAuthedSupabase();
  if (authed instanceof NextResponse) return authed;
  const { supabase, userId } = authed;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const billing = getBillingService();

  try {
    if (kind === "subscription") {
      if (!tier || !TIERS.some((t) => t.id === tier)) {
        return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
      }
      const session = await billing.createSubscriptionCheckout({
        userId,
        tier,
        successUrl: `${siteUrl}/billing?success=1`,
        cancelUrl: `${siteUrl}/billing?canceled=1`,
        customerId: profile?.stripe_customer_id ?? undefined,
      });
      return NextResponse.json({ url: session.url });
    }

    if (kind === "topup") {
      if (!pack || !TOPUP_PACKS.some((p) => p.id === pack)) {
        return NextResponse.json({ error: "invalid_pack" }, { status: 400 });
      }
      const session = await billing.createTopupCheckout({
        userId,
        pack,
        successUrl: `${siteUrl}/billing?success=1`,
        cancelUrl: `${siteUrl}/billing?canceled=1`,
        customerId: profile?.stripe_customer_id ?? undefined,
      });
      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "billing_not_configured", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 }
    );
  }
}
