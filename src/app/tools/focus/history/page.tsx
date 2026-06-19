import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function FocusHistoryPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/tools/focus/history");

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("focus_sessions")
    .select("id, goal, duration_minutes, focus_level, reflection, credits_spent, completed_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Focus Session History
      </h1>
      <div className="mt-6 space-y-3">
        {(rows ?? []).length === 0 ? (
          <p className="text-cream/60">No focus sessions yet.</p>
        ) : (
          rows!.map((row) => (
            <Card key={row.id}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-cream">{row.goal}</p>
                  <p className="text-sm text-cream/50">
                    {row.duration_minutes} min · {row.focus_level} coaching ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge>-{row.credits_spent} credits</Badge>
              </div>
              {row.reflection && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-cream/70">{row.reflection}</p>
              )}
              {!row.completed_at && (
                <p className="mt-2 text-xs uppercase tracking-wide text-cream/40">
                  Not completed
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
