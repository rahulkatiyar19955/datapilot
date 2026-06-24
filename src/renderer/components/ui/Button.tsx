import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      default: "",
      primary: "primary",
      ghost: "ghost",
    },
    size: {
      md: "",
      sm: "sm",
    },
    icon: {
      true: "icon",
      false: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
    icon: false,
  },
});

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Generic button. cva variants:
 *   - `variant`: default | primary | ghost
 *   - `size`: md | sm
 *   - `icon`: true (square 28/24px) | false
 *
 * Always typed `<button type="button">` by default — opt into "submit" via the
 * native `type` prop when wired into a `<form>`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant, size, icon, className, type, children, ...rest },
    ref,
  ) {
    // Icon-only buttons have no visible text to act as an accessible name.
    // Derive `aria-label` from `title` (the common tooltip pattern) when the
    // caller hasn't supplied children or an explicit aria-label, so the button
    // is reachable by assistive tech (issue #49).
    const ariaLabel =
      icon && children == null && rest["aria-label"] == null && rest.title
        ? rest.title
        : rest["aria-label"];

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(buttonVariants({ variant, size, icon }), className)}
        {...rest}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  },
);
