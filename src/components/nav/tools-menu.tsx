"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const TOOLS = [
  { href: "/tools/room-check", label: "Room Check", emoji: "🏠" },
  { href: "/tools/tutor", label: "Standard Tutor", emoji: "📚" },
  { href: "/tools/focus", label: "Master Focus Coach", emoji: "🧠" },
];

export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-cream/80 hover:text-cream"
      >
        Tools
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-cream/10 bg-ink-soft p-2 shadow-xl">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream/80 hover:bg-cream/5 hover:text-cream"
            >
              <span>{t.emoji}</span>
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
