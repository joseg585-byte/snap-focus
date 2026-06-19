// =============================================================
// Abstract billing layer.
// Web today = Stripe. The architectural end goal is a Capacitor iOS app,
// so all payment logic is hidden behind this interface — Apple IAP /
// RevenueCat can drop in later by implementing BillingService, with zero
// changes to callers.
// =============================================================

import type { TierId, TopupId } from "@/lib/config";

export interface CheckoutSession {
  /** Provider-hosted URL the client redirects to (Stripe Checkout, etc.). */
  url: string;
  /** Provider session id, for reconciliation. */
  id: string;
}

export interface SubscriptionCheckoutParams {
  userId: string;
  tier: TierId;
  successUrl: string;
  cancelUrl: string;
  /** Existing provider customer id, if the user already has one. */
  customerId?: string;
}

export interface TopupCheckoutParams {
  userId: string;
  pack: TopupId;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
}

/** Normalized webhook outcome the credit layer can act on. */
export type BillingEvent =
  | {
      type: "subscription_activated";
      userId: string;
      tier: TierId;
      eventId: string;
      customerId?: string;
      subscriptionId?: string;
    }
  | { type: "subscription_canceled"; userId: string; eventId: string }
  | { type: "topup_purchased"; userId: string; pack: TopupId; credits: number; eventId: string }
  /** Monthly renewal invoice paid — refill the tier's monthly credit allotment. */
  | { type: "invoice_paid"; userId: string; tier: TierId; eventId: string }
  | { type: "ignored"; eventId: string };

export interface BillingService {
  readonly provider: string;

  createSubscriptionCheckout(params: SubscriptionCheckoutParams): Promise<CheckoutSession>;
  createTopupCheckout(params: TopupCheckoutParams): Promise<CheckoutSession>;

  /** Verify + normalize a raw provider webhook into a BillingEvent. */
  parseWebhook(rawBody: string, signature: string): Promise<BillingEvent>;
}
