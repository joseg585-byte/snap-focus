// =============================================================
// Stripe implementation of BillingService.
// STUB: wired for structure, not live charges. Real Checkout + webhook
// verification activate once STRIPE_SECRET_KEY / price IDs are set in env.
// Throwing clearly when unconfigured keeps the scaffold honest — no
// pretend success paths.
// =============================================================

import type {
  BillingService,
  BillingEvent,
  CheckoutSession,
  SubscriptionCheckoutParams,
  TopupCheckoutParams,
} from "./types";
import { TIERS, TOPUP_PACKS } from "@/lib/config";

function requireKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local to enable live billing — " +
        "see .env.example. (Scaffold ships with billing stubbed.)"
    );
  }
  return key;
}

export class StripeBillingService implements BillingService {
  readonly provider = "stripe";

  async createSubscriptionCheckout(
    params: SubscriptionCheckoutParams
  ): Promise<CheckoutSession> {
    requireKey();
    const tier = TIERS.find((t) => t.id === params.tier);
    if (!tier) throw new Error(`Unknown tier: ${params.tier}`);
    // TODO: const stripe = new Stripe(key); create a subscription Checkout
    // session against the configured price id for `tier`, then return its url.
    throw new Error("StripeBillingService.createSubscriptionCheckout not implemented in scaffold.");
  }

  async createTopupCheckout(params: TopupCheckoutParams): Promise<CheckoutSession> {
    requireKey();
    const pack = TOPUP_PACKS.find((p) => p.id === params.pack);
    if (!pack) throw new Error(`Unknown top-up pack: ${params.pack}`);
    // TODO: one-time payment Checkout session for `pack.priceCents`, granting
    // `pack.credits` on the `checkout.session.completed` webhook.
    throw new Error("StripeBillingService.createTopupCheckout not implemented in scaffold.");
  }

  async parseWebhook(rawBody: string, signature: string): Promise<BillingEvent> {
    requireKey();
    void rawBody;
    void signature;
    // TODO: stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET)
    // then map subscription/checkout events into the normalized BillingEvent.
    throw new Error("StripeBillingService.parseWebhook not implemented in scaffold.");
  }
}
