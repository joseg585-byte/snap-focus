import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KID_TOOLS } from "@/lib/config";

interface ActivityItem {
  key: string;
  label: string;
  detail: string;
  credits: number;
  createdAt: string;
}

async function getRecentActivity(userId: string): Promise<ActivityItem[]> {
  const supabase = await createSupabaseServerClient();

  const [cleanChecks, homeworkChecks, studyQuizzes] = await Promise.all([
    supabase
      .from("room_checks")
      .select("id, level, area, overall_pass, credits_spent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("homework_checks")
      .select("id, verdict, credits_spent, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("lesson_plans")
      .select("id, title, credits_spent, created_at")
      .eq("user_id", userId)
      .eq("action", "study_quiz")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const items: ActivityItem[] = [
    ...(cleanChecks.data ?? []).map((r) => ({
      key: `clean_check:${r.id}`,
      label: "Clean Check",
      detail: `${r.area} · ${r.level} · ${r.overall_pass === null ? "pending" : r.overall_pass ? "passed" : "needs work"}`,
      credits: r.credits_spent,
      createdAt: r.created_at,
    })),
    ...(homeworkChecks.data ?? []).map((h) => ({
      key: `homework_check:${h.id}`,
      label: "Homework Check",
      detail: h.verdict === "pass" ? "done" : h.verdict === "fail" ? "needs work" : "not homework",
      credits: h.credits_spent,
      createdAt: h.created_at,
    })),
    ...(studyQuizzes.data ?? []).map((s) => ({
      key: `study_quiz:${s.id}`,
      label: "Study Quiz",
      detail: s.title ?? "Study session",
      credits: s.credits_spent,
      createdAt: s.created_at,
    })),
  ];

  return items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
}

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
        {KID_TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href} className="block">
            <Card className="h-full transition-transform hover:-translate-y-0.5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    {tool.emoji} {tool.name}
                  </CardTitle>
                  <Badge>{typeof tool.cost === "number" ? `${tool.cost} credits` : tool.cost}</Badge>
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
              Nothing yet — run a Clean Check, a Homework Check, or a Study Quiz.
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

      <p className="mt-10 text-center text-xs text-cream/30">
        <Link href="/tools/focus" className="hover:text-cream/60">
          Adult Study Coach (beta)
        </Link>
      </p>
    </main>
  );
}
