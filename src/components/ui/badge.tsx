import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-3 py-1",
        "text-xs font-semibold uppercase tracking-[0.18em] text-gold",
        className
      )}
      {...props}
    />
  );
}
