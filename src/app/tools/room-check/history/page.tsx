import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";
import { RoomCheckHistoryList, type RoomCheckHistoryItem } from "@/components/room-check/history-list";

export default async function RoomCheckHistoryPage() {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect("/login?next=/tools/room-check/history");

  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("room_checks")
    .select("id, level, overall_pass, ai_feedback, area_results, storage_paths, credits_spent, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items: RoomCheckHistoryItem[] = await Promise.all(
    (rows ?? []).map(async (row) => {
      const paths: string[] = row.storage_paths ?? [];
      const signedUrls = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage
            .from("room-checks")
            .createSignedUrl(path, 60 * 60);
          return data?.signedUrl ?? null;
        })
      );
      return {
        id: row.id,
        level: row.level,
        overallPass: row.overall_pass,
        summary: row.ai_feedback,
        areas: (row.area_results as { title: string; pass: boolean; note: string }[]) ?? [],
        creditsSpent: row.credits_spent,
        createdAt: row.created_at,
        photoUrls: signedUrls.filter((u): u is string => Boolean(u)),
      };
    })
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display text-3xl uppercase tracking-tight text-cream sm:text-4xl">
        Room Check History
      </h1>
      <RoomCheckHistoryList items={items} />
    </main>
  );
}
