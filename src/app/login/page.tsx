"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", next);

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo.toString() },
      });

      if (otpError) {
        setError(otpError.message);
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to SnapFocus</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "sent" ? (
            <div className="space-y-2 text-center">
              <p className="text-cream">Check your inbox.</p>
              <p className="text-sm text-cream/60">
                We sent a magic link to <span className="text-gold">{email}</span>. Click it to
                sign in — no password needed.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-cream/60">
                Enter your email and we&apos;ll send you a one-click sign-in link.
              </p>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-lg border border-cream/15 bg-ink px-4 text-cream placeholder:text-cream/40 focus:border-gold/60 focus:outline-none"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
