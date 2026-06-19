import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AI_FEATURES, ROOM_CHECK_LEVELS } from "@/lib/config";

interface ActivityItem {
  key: string;
  label: string;
  detail: string;
  credits: number;
  createdAt: string;
}

async function getRecentActivity(userId: string): Promise<ActivityItem[]> {
  const supabase = await createSupabaseServerClient();

  const [roomChecks, lessonPlans, focusSessions] = await Promise.all([
    supabase
      .from("room_checks")
      .select("id, level, overall_pass, credits_spent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("lesson_plans")
      .select("id, title, credits_spent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("focus_sessions")
      .select("id, goal, credits_spent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const items: ActivityItem[] = [
    ...(roomChecks.data ?? []).map((r) => ({
      key: `room_check:${r.id}`,
      label: "Room Check",
      detail: `${r.level} · ${r.overall_pass === null ? "pending" : r.overall_pass ? "passed" : "needs work"}`,
      credits: r.credits_spent,
      createdAt: r.created_at,
    })),
    ...(lessonPlans.data ?? []).map((l) => ({
      key: `tutor:${l.id}`,
      label: "Standard Tutor",
      detail: l.title ?? "Lesson plan",
      credits: l.credits_spent,
      createdAt: l.created_at,
    })),
    ...(focusSessions.data ?? []).map((f) => ({
      key: `focus:${f.id}`,
      label: "Master Focus Coach",
      detail: f.goal,
      credits: f.credits_spent,
      createdAt: f.created_at,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
}

const TOOL_CARDS = [
  {
    href: "/tools/room-check",
    emoji: "🏠",
    name: "Room Check",
    blurb: "Verify your room is clean",
    cost: `from ${Math.min(...ROOM_CHECK_LEVELS.map((l) => l.cost))} credit`,
  },
  {
    href: "/tools/tutor",
    emoji: "📚",
    name: "Standard Tutor",
    blurb: "Generate a lesson plan or quiz",
    cost: `${AI_FEATURES.find((f) => f.action === "standard_tutor")?.cost} credits`,
  },
  {
    href: "/tools/focus",
    emoji: "🧠",
    name: "Master Focus Coach",
    blurb: "AI-coached focus session",
    cost: `${AI_FEATURES.find((f) => f.action === "master_coach")?.cost} credits`,
  },
];

export default async function DashboardPage() {
  const { user, profile } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/dashboard");

  const activity = profile ? await getRecentActivity(profile.id) : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Dashboard
      </h1>

      {/* Credit balance widget */}
      <Card className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl text-gold">
              {profile?.creditBalance ?? 0}
            </span>
            <span className="text-sm uppercase tracking-[0.2em] text-cream/50">credits</span>
          </div>
          <p className="mt-1 text-sm text-cream/60">
            Signed in as {profile?.email} · {profile?.tier} plan
          </p>
        </div>
        <Link
          href="/billing"
          className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-5 text-sm font-semibold text-ink shadow-[0_0_24px_-6px_rgba(201,162,39,0.6)] hover:bg-gold-bright"
        >
          Top up
        </Link>
      </Card>

      {/* Tool cards */}
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {TOOL_CARDS.map((tool) => (
          <Link key={tool.href} href={tool.href} className="block">
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    {tool.emoji} {tool.name}
                  </CardTitle>
                  <Badge>{tool.cost}</Badge>
                </div>
              </CardHeader>
              <CardContent>{tool.blurb}</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <section className="mt-10">
        <h2 className="font-display text-xl uppercase tracking-tight text-cream">
          Recent activity
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-cream/10 bg-ink-soft/60 backdrop-blur">
          {activity.length === 0 ? (
            <p className="p-6 text-sm text-cream/60">
              Nothing yet — run a Room Check, generate a lesson, or start a focus session.
            </p>
          ) : (
            <ul className="divide-y divide-cream/10">
              {activity.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-4 px-6 py-4 text-sm"
                >
                  <div>
                    <p className="text-cream">{item.label}</p>
                    <p className="text-cream/50">{item.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gold">-{item.credits} credits</p>
                    <p className="text-cream/40">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
