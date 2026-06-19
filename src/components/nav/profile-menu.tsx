"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

export function ProfileMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const initial = email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-semibold text-gold"
        aria-label="Profile menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-cream/10 bg-ink-soft p-2 shadow-xl">
          <div className="truncate px-3 py-2 text-xs text-cream/50">{email}</div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-cream/80 hover:bg-cream/5 hover:text-cream"
          >
            Dashboard
          </Link>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-cream/80 hover:bg-cream/5 hover:text-cream"
          >
            Account
          </Link>
          <Link
            href="/billing"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-cream/80 hover:bg-cream/5 hover:text-cream"
          >
            Billing
          </Link>
          <a
            href="/logout"
            className="block rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
          >
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
