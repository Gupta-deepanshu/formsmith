import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong border border-transparent",
  secondary: "bg-surface text-fg border border-line-strong hover:bg-subtle",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-subtle",
  danger: "bg-danger text-white border border-transparent hover:opacity-90 dark:text-canvas",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function buttonClasses({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and sets aria-busy. The label stays for screen readers. */
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export function Button({ variant, size, loading = false, leadingIcon, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner size="sm" /> : leadingIcon}
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, "children" | "leadingIcon"> & {
  /** Required: icon-only buttons need an accessible name. Also shown as a tooltip. */
  label: string;
  icon: ReactNode;
};

export function IconButton({ label, icon, size = "md", className, ...props }: IconButtonProps) {
  const square = size === "sm" ? "w-8 px-0" : size === "lg" ? "w-12 px-0" : "w-10 px-0";
  return (
    <Button aria-label={label} title={label} size={size} className={cn(square, className)} {...props}>
      {icon}
    </Button>
  );
}
