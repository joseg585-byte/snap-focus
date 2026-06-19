// Data Access Layer helper: current authenticated user + their profile row.
// Centralized here so every Server Component does the same auth check.
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TierId } from "@/lib/config";

export interface CurrentProfile {
  id: string;
  email: string;
  tier: TierId;
  creditBalance: number;
  createdAt: string;
}

export async function getCurrentUserAndProfile(): Promise<{
  user: { id: string; email: string } | null;
  profile: CurrentProfile | null;
}> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { user: null, profile: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, tier, credit_balance, created_at")
    .eq("id", user.id)
    .single();

  return {
    user: { id: user.id, email: user.email ?? "" },
    profile: profile
      ? {
          id: profile.id,
          email: profile.email ?? user.email ?? "",
          tier: profile.tier as TierId,
          creditBalance: profile.credit_balance,
          createdAt: profile.created_at,
        }
      : null,
  };
}
