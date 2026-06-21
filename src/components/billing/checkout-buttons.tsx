"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TIERS, TOPUP_PACKS, dollars, type TierId, type TopupId } from "@/lib/config";
import { TOOL_CREDIT_COSTS } from "@/lib/credits/costs";

export function CheckoutButtons({ currentTier }: { currentTier: TierId }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(body: { kind: "subscription"; tier: TierId } | { kind: "topup"; pack: TopupId }) {
    const id = "tier" in body ? body.tier : body.pack;
    setLoading(id);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.message || data.error || "Stripe isn't configured yet.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-10">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">
          Change plan
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {TIERS.map((tier) => {
            const isCurrent = tier.id === currentTier;
            return (
              <Card key={tier.id} highlighted={tier.highlight} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{tier.name}</CardTitle>
                    {isCurrent && <Badge>Current</Badge>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-3xl text-gold">
                      {dollars(tier.priceCents)}
                    </span>
                    <span className="text-cream/50">/mo</span>
                  </div>
                  <p className="text-sm text-cream/60">{tier.monthlyCredits.toLocaleString()} credits / month</p>
                  <p className="text-xs text-cream/40">
                    ~{Math.floor(tier.monthlyCredits / TOOL_CREDIT_COSTS.standard_tutor_interactive)} interactive
                    lessons OR {Math.floor(tier.monthlyCredits / TOOL_CREDIT_COSTS.master_coach_coached)} coached
                    study sessions per month
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end">
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "primary"}
                    disabled={isCurrent || loading === tier.id}
                    onClick={() => checkout({ kind: "subscription", tier: tier.id })}
                  >
                    {isCurrent
                      ? "Current plan"
                      : loading === tier.id
                        ? "Redirecting…"
                        : `Choose ${tier.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">
          Top up credits
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <Card key={pack.id} className="text-center">
              <CardTitle className="text-lg">{pack.name}</CardTitle>
              <div className="mt-1 font-display text-2xl text-gold">
                {pack.credits.toLocaleString()}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-cream/50">credits</div>
              <Button
                variant="outline"
                className="mt-4 w-full"
                disabled={loading === pack.id}
                onClick={() => checkout({ kind: "topup", pack: pack.id })}
              >
                {loading === pack.id ? "Redirecting…" : dollars(pack.priceCents)}
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
