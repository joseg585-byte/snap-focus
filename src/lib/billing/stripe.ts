// =============================================================
// Stripe implementation of BillingService. Test-mode Checkout sessions +
// webhook verification. Activates once STRIPE_SECRET_KEY / price IDs are
// set in env — see .env.example.
// =============================================================
import "server-only";
import Stripe from "stripe";
import type {
  BillingService,
  BillingEvent,
  CheckoutSession,
  SubscriptionCheckoutParams,
  TopupCheckoutParams,
} from "./types";
import { TIERS, TOPUP_PACKS, type TierId, type TopupId } from "@/lib/config";

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

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(requireKey());
  return stripeClient;
}

const TIER_PRICE_ENV: Record<TierId, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  ultimate: "STRIPE_PRICE_ULTIMATE",
};

const TOPUP_PRICE_ENV: Record<TopupId, string> = {
  quick_fix: "STRIPE_PRICE_QUICK_FIX",
  value_pack: "STRIPE_PRICE_VALUE_PACK",
  power_pack: "STRIPE_PRICE_POWER_PACK",
};

function priceIdForTier(tier: TierId): string {
  const envVar = TIER_PRICE_ENV[tier];
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`${envVar} is not set. See .env.example.`);
  return priceId;
}

function priceIdForPack(pack: TopupId): string {
  const envVar = TOPUP_PRICE_ENV[pack];
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`${envVar} is not set. See .env.example.`);
  return priceId;
}

export class StripeBillingService implements BillingService {
  readonly provider = "stripe";

  async createSubscriptionCheckout(
    params: SubscriptionCheckoutParams
  ): Promise<CheckoutSession> {
    const stripe = getStripe();
    const tier = TIERS.find((t) => t.id === params.tier);
    if (!tier) throw new Error(`Unknown tier: ${params.tier}`);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdForTier(params.tier), quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      customer: params.customerId,
      metadata: { userId: params.userId, tier: params.tier },
      subscription_data: { metadata: { userId: params.userId, tier: params.tier } },
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return { url: session.url, id: session.id };
  }

  async createTopupCheckout(params: TopupCheckoutParams): Promise<CheckoutSession> {
    const stripe = getStripe();
    const pack = TOPUP_PACKS.find((p) => p.id === params.pack);
    if (!pack) throw new Error(`Unknown top-up pack: ${params.pack}`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceIdForPack(params.pack), quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.userId,
      customer: params.customerId,
      metadata: { userId: params.userId, pack: params.pack, credits: String(pack.credits) },
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return { url: session.url, id: session.id };
  }

  async parseWebhook(rawBody: string, signature: string): Promise<BillingEvent> {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set. See .env.example.");

    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.userId;
        if (!userId) return { type: "ignored", eventId: event.id };

        if (session.mode === "subscription") {
          const tier = session.metadata?.tier as TierId | undefined;
          if (!tier) return { type: "ignored", eventId: event.id };
          return {
            type: "subscription_activated",
            userId,
            tier,
            eventId: event.id,
            customerId:
              typeof session.customer === "string" ? session.customer : session.customer?.id,
            subscriptionId:
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription?.id,
          };
        }

        const pack = session.metadata?.pack as TopupId | undefined;
        const credits = Number(session.metadata?.credits ?? 0);
        if (!pack || !credits) return { type: "ignored", eventId: event.id };
        return { type: "topup_purchased", userId, pack, credits, eventId: event.id };
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) return { type: "ignored", eventId: event.id };
        return { type: "subscription_canceled", userId, eventId: event.id };
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        const tier = subscription.metadata?.tier as TierId | undefined;
        if (!userId) return { type: "ignored", eventId: event.id };
        if (subscription.status === "canceled" || subscription.cancel_at_period_end) {
          return { type: "subscription_canceled", userId, eventId: event.id };
        }
        if (!tier) return { type: "ignored", eventId: event.id };
        return { type: "subscription_activated", userId, tier, eventId: event.id };
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
        if (!subscriptionId) return { type: "ignored", eventId: event.id };
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.userId;
        const tier = subscription.metadata?.tier as TierId | undefined;
        if (!userId || !tier) return { type: "ignored", eventId: event.id };
        // The very first invoice fires alongside checkout.session.completed —
        // grant_credits() is idempotent on event id, so a double-grant here
        // is harmless; subsequent monthly invoices are the real renewals.
        return { type: "invoice_paid", userId, tier, eventId: event.id };
      }

      default:
        return { type: "ignored", eventId: event.id };
    }
  }
}
