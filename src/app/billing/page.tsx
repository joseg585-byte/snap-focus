import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card } from "@/components/ui/card";
import { CheckoutButtons } from "@/components/billing/checkout-buttons";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/billing");

  const { success, canceled } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Billing
      </h1>

      {success && (
        <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3 text-sm text-gold">
          Checkout complete — your account will update once Stripe&apos;s webhook confirms payment.
        </p>
      )}
      {canceled && (
        <p className="mt-4 rounded-lg border border-cream/15 bg-cream/5 p-3 text-sm text-cream/70">
          Checkout canceled — no changes were made.
        </p>
      )}

      <Card className="mt-6 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-cream/50">Current plan</p>
          <p className="font-display text-2xl capitalize text-cream">{profile?.tier ?? "starter"}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-cream/50">Credit balance</p>
          <p className="font-display text-2xl text-gold">{profile?.creditBalance ?? 0}</p>
        </div>
      </Card>

      <div className="mt-10">
        <CheckoutButtons currentTier={profile?.tier ?? "starter"} />
      </div>
    </main>
  );
}
