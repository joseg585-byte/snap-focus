import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost";
type Size = "default" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold text-ink hover:bg-gold-bright shadow-[0_0_24px_-6px_rgba(201,162,39,0.6)]",
  outline:
    "border border-gold/40 text-cream hover:border-gold hover:bg-gold/10",
  ghost: "text-cream/80 hover:text-cream hover:bg-cream/5",
};

const sizes: Record<Size, string> = {
  default: "h-11 px-5 text-sm",
  lg: "h-14 px-8 text-base",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: never;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
