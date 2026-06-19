import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { Card } from "@/components/ui/card";

interface LessonPlanRow {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  metadata: { subject?: string; gradeLevel?: string; goal?: string } | null;
}

export default async function TutorLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; grade?: string }>;
}) {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/tools/tutor/library");

  const { subject, grade } = await searchParams;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("lesson_plans")
    .select("id, title, content, created_at, metadata")
    .eq("user_id", user.id)
    .eq("action", "standard_tutor")
    .order("created_at", { ascending: false });

  if (subject) query = query.eq("metadata->>subject", subject);
  if (grade) query = query.eq("metadata->>gradeLevel", grade);

  const { data: rows } = await query;
  const items = (rows ?? []) as LessonPlanRow[];

  const subjects = Array.from(
    new Set((rows ?? []).map((r) => r.metadata?.subject).filter(Boolean))
  ) as string[];
  const grades = Array.from(
    new Set((rows ?? []).map((r) => r.metadata?.gradeLevel).filter(Boolean))
  ) as string[];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Tutor Library
      </h1>

      <form className="mt-6 flex flex-wrap gap-3" method="get">
        <select
          name="subject"
          defaultValue={subject ?? ""}
          className="h-10 rounded-lg border border-cream/15 bg-ink px-3 text-sm text-cream"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="grade"
          defaultValue={grade ?? ""}
          className="h-10 rounded-lg border border-cream/15 bg-ink px-3 text-sm text-cream"
        >
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg border border-gold/40 px-4 text-sm text-gold hover:bg-gold/10"
        >
          Filter
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <p className="text-cream/60">No saved lessons yet.</p>
        ) : (
          items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg uppercase tracking-tight text-cream">
                  {item.title}
                </h2>
                <span className="text-xs text-cream/40">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-cream/60">
                {item.content}
              </p>
            </Card>
          ))
        )}
      </div>

      <Link href="/tools/tutor" className="mt-8 inline-block text-sm text-gold underline">
        ← New lesson
      </Link>
    </main>
  );
}
