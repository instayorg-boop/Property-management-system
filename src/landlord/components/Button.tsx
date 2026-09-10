import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";
export type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const sizeCls: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-2 text-sm",
};

const variantCls: Record<ButtonVariant, string> = {
  primary: "raised-btn-brand",
  secondary: "raised-btn text-ink",
  danger: "border border-line text-red-600 transition-colors hover:bg-red-50",
  // Solid fill for an actual "confirm delete" CTA — `danger` plus a `bg-red-600 text-paper`
  // className override used to be how call sites did this, but the two text-color utilities
  // (danger's text-red-600 vs the override's text-paper) collide unpredictably since Tailwind's
  // generated CSS order isn't the same as the className string's order, which could render as
  // illegible red-on-red. This variant is the CSS itself, no override needed.
  dangerSolid: "bg-red-600 text-paper transition-colors hover:bg-red-700",
  ghost: "text-muted transition-colors hover:bg-mist hover:text-ink",
};

/**
 * The one raised-button surface for every primary/secondary action in the app — swap `variant`
 * rather than hand-rolling gradients/shadows again. `danger` and `ghost` stay flat (a raised
 * lower-priority or destructive action would fight for attention against a raised primary one).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium disabled:cursor-not-allowed disabled:opacity-50 ${sizeCls[size]} ${variantCls[variant]} ${className}`}
      {...props}
    />
  );
});

export default Button;
