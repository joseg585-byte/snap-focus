import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card } from "@/components/ui/card";
import { FocusSessionFlow } from "@/components/focus/focus-session-flow";

export default async function FocusPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/tools/focus");

  if (profile?.tier !== "ultimate") {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-20 text-center">
        <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
          🧠 Master Focus Coach
        </h1>
        <Card className="mt-8">
          <p className="text-cream">Ultimate tier required.</p>
          <p className="mt-2 text-sm text-cream/60">
            The flagship AI-coached focus session is exclusive to the Ultimate plan — 10
            credits for a Coached subject session, or 5 credits for Just Focus.
          </p>
          <Link
            href="/billing"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gold px-6 text-sm font-semibold text-ink shadow-[0_0_24px_-6px_rgba(201,162,39,0.6)] hover:bg-gold-bright"
          >
            Upgrade to Ultimate
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        🧠 Master Focus Coach
      </h1>
      <p className="mt-2 text-cream/60">
        10 credits for a Coached study session (AI builds a plan and teaches), or 5 credits for Just Focus
        (Pomodoro timer with check-ins).
      </p>
      <div className="mt-8">
        <FocusSessionFlow />
      </div>
    </main>
  );
}
