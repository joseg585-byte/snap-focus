import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card } from "@/components/ui/card";

const REASON_LABEL: Record<string, string> = {
  monthly_grant: "Monthly refill",
  topup_purchase: "Top-up purchase",
  room_check: "Room Check",
  standard_tutor: "Standard Tutor",
  master_coach: "Master Focus Coach",
  admin_adjustment: "Adjustment",
  refund: "Refund",
};

export default async function AccountPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/account");

  const supabase = await createSupabaseServerClient();
  const { data: transactions } = await supabase
    .from("credit_transactions")
    .select("id, amount, reason, balance_after, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Account
      </h1>

      <Card className="mt-6 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-cream/50">Email</p>
          <p className="text-cream">{profile?.email ?? user.email}</p>
        </div>
        <div>
          <p className="text-sm text-cream/50">Signed up</p>
          <p className="text-cream">
            {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm text-cream/50">Current plan</p>
          <p className="capitalize text-cream">{profile?.tier ?? "starter"}</p>
        </div>
      </Card>

      <Card className="mt-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-cream/50">Credit balance</p>
          <p className="font-display text-3xl text-gold">{profile?.creditBalance ?? 0}</p>
        </div>
        <Link
          href="/billing"
          className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-5 text-sm font-semibold text-ink shadow-[0_0_24px_-6px_rgba(201,162,39,0.6)] hover:bg-gold-bright"
        >
          Top up
        </Link>
      </Card>

      <section className="mt-10">
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">
          Transaction history
        </h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-cream/10 bg-ink-soft/60">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cream/10 text-cream/50">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream/5">
              {(transactions ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-cream/50">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                transactions!.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-cream/70">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={tx.amount >= 0 ? "text-gold" : "text-cream/70"}>
                        {tx.amount >= 0 ? "Gain" : "Spend"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-cream/70">
                      {REASON_LABEL[tx.reason] ?? tx.reason}
                    </td>
                    <td className="px-4 py-3 text-right text-cream">
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount}
                    </td>
                    <td className="px-4 py-3 text-right text-cream/70">{tx.balance_after}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">Settings</h2>
        <Card className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cream">Notification preferences</p>
              <p className="text-sm text-cream/50">Coming soon — email alerts for low balance.</p>
            </div>
            <span className="rounded-full border border-cream/15 px-3 py-1 text-xs text-cream/40">
              Placeholder
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-cream/10 pt-4">
            <div>
              <p className="text-cream">Delete account</p>
              <p className="text-sm text-cream/50">Permanently remove your data.</p>
            </div>
            <button
              disabled
              className="rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-400/50"
            >
              Not yet available
            </button>
          </div>
        </Card>
      </section>
    </main>
  );
}
