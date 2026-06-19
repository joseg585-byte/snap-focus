// Factory: returns the active BillingService. Swap the implementation here
// (Stripe → Apple IAP / RevenueCat) without touching any caller.
import type { BillingService } from "./types";
import { StripeBillingService } from "./stripe";

let instance: BillingService | null = null;

export function getBillingService(): BillingService {
  if (!instance) {
    switch (process.env.BILLING_PROVIDER ?? "stripe") {
      case "stripe":
      default:
        instance = new StripeBillingService();
    }
  }
  return instance;
}

export type { BillingService, BillingEvent } from "./types";
