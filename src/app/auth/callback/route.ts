// GET /auth/callback — magic link return. Exchanges the PKCE code for a
// session (cookies set via the server client) then redirects into the app.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url.origin));
      }
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin)
      );
    } catch {
      return NextResponse.redirect(
        new URL("/login?error=supabase_not_configured", url.origin)
      );
    }
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
