import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "cn";
import { Button as ShadcnButton } from "@/components/ui/button";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "dangerSolid" | "warning" | "ghost";
export type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

// Maps this app's existing variant/size vocabulary onto shadcn's `buttonVariants`, so every call
// site keeps working unchanged while the actual rendered markup becomes the shadcn `Button`
// primitive (Slot-capable, same focus-ring/disabled treatment as every other shadcn control).
const sizeMap: Record<ButtonSize, "sm" | "default"> = {
  sm: "sm",
  md: "default",
};

// Token-compliant className overlays per variant — shadcn's own `default`/`outline`/`ghost`
// variants already speak bg-primary/border/accent tokens, so most of these just pass through;
// the ones this app treats as visually distinct (dangerSolid, warning) get a small token-based
// override rather than a new shadcn variant, since they're app-specific semantics.
const variantCls: Record<ButtonVariant, { shadcnVariant: "default" | "outline" | "ghost" | "destructive"; className?: string }> = {
  primary: { shadcnVariant: "default" },
  secondary: { shadcnVariant: "outline", className: "bg-card" },
  outline: { shadcnVariant: "outline" },
  danger: { shadcnVariant: "outline", className: "border-destructive/40 text-destructive hover:bg-destructive/10" },
  dangerSolid: { shadcnVariant: "destructive" },
  warning: {
    shadcnVariant: "default",
    className: "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500/50",
  },
  ghost: { shadcnVariant: "ghost", className: "text-muted-foreground" },
};

/**
 * Thin wrapper around shadcn's `Button` — keeps this app's existing `variant`/`size` vocabulary at
 * every call site while delegating the actual rendering (focus ring, disabled state, radius) to the
 * shared primitive.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref
) {
  const { shadcnVariant, className: variantClassName } = variantCls[variant];
  return (
    <ShadcnButton
      ref={ref}
      type={type}
      variant={shadcnVariant}
      size={sizeMap[size]}
      className={cn(variantClassName, className)}
      {...props}
    />
  );
});

export default Button;
