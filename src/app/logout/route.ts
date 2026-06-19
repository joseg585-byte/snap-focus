// GET /logout — clears the Supabase session, then redirects home.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Supabase not configured — nothing to sign out of.
  }
  return NextResponse.redirect(new URL("/", request.url));
}
