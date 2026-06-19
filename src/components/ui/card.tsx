import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  highlighted,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { highlighted?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-ink-soft/60 backdrop-blur p-6 transition-colors",
        highlighted
          ? "border-gold/70 shadow-[0_0_40px_-12px_rgba(201,162,39,0.45)]"
          : "border-cream/10 hover:border-cream/20",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 space-y-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-serif text-2xl text-cream", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-cream/70", className)} {...props} />;
}
