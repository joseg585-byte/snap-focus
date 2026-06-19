import Link from "next/link";
import { ToolsMenu } from "./tools-menu";
import { ProfileMenu } from "./profile-menu";
import { getCurrentUserAndProfile } from "@/lib/supabase/profile";

export async function SiteHeader() {
  const { user, profile } = await getCurrentUserAndProfile();

  return (
    <header className="sticky top-0 z-40 border-b border-cream/10 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-display text-lg uppercase tracking-tight text-cream">
          Snap<span className="text-gold">Focus</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <Link
              href="/billing"
              className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm"
            >
              <span className="font-display text-base text-gold">
                {profile?.creditBalance ?? "—"}
              </span>
              <span className="text-xs uppercase tracking-wide text-cream/60">credits</span>
            </Link>
            <ToolsMenu />
            <ProfileMenu email={profile?.email ?? user.email} />
          </div>
        ) : (
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-5 text-sm font-semibold text-ink shadow-[0_0_24px_-6px_rgba(201,162,39,0.6)] hover:bg-gold-bright"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
