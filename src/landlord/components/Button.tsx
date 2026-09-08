import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
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
