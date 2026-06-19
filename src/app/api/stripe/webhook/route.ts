// POST /api/stripe/webhook — Stripe sends checkout/subscription/invoice
// events here. Verifies the signature, then applies tier changes and
// credit grants via the service-role client (no user session in a webhook).
import { NextResponse } from "next/server";
import { getBillingService } from "@/lib/billing";
import { grantCredits } from "@/lib/credits";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { TIERS, TOPUP_PACKS } from "@/lib/config";

function monthlyCreditsForTier(tier: string): number {
  return TIERS.find((t) => t.id === tier)?.monthlyCredits ?? 0;
}

function priceCentsForPack(pack: string): number {
  return TOPUP_PACKS.find((p) => p.id === pack)?.priceCents ?? 0;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const rawBody = await req.text();
  const billing = getBillingService();

  let event;
  try {
    event = await billing.parseWebhook(rawBody, signature);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_signature", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServiceClient();

  switch (event.type) {
    case "subscription_activated": {
      await supabase
        .from("profiles")
        .update({
          tier: event.tier,
          subscription_status: "active",
          billing_provider: "stripe",
          ...(event.customerId ? { stripe_customer_id: event.customerId } : {}),
          ...(event.subscriptionId ? { provider_subscription_id: event.subscriptionId } : {}),
          billing_anchor: new Date().toISOString(),
        })
        .eq("id", event.userId);

      await grantCredits({
        userId: event.userId,
        amount: monthlyCreditsForTier(event.tier),
        reason: "monthly_grant",
        idempotencyKey: event.eventId,
        setAbsolute: true,
      });
      break;
    }

    case "invoice_paid": {
      await grantCredits({
        userId: event.userId,
        amount: monthlyCreditsForTier(event.tier),
        reason: "monthly_grant",
        idempotencyKey: event.eventId,
        setAbsolute: true,
      });
      break;
    }

    case "subscription_canceled": {
      await supabase
        .from("profiles")
        .update({ subscription_status: "canceled" })
        .eq("id", event.userId);
      break;
    }

    case "topup_purchased": {
      await grantCredits({
        userId: event.userId,
        amount: event.credits,
        reason: "topup_purchase",
        idempotencyKey: event.eventId,
      });
      await supabase.from("purchases").insert({
        user_id: event.userId,
        kind: "topup",
        sku: event.pack,
        amount_cents: priceCentsForPack(event.pack),
        credits_granted: event.credits,
        provider_event_id: event.eventId,
      });
      break;
    }

    case "ignored":
      break;
  }

  return NextResponse.json({ received: true });
}
