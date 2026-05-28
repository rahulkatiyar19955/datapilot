import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@renderer/lib/utils";

const inputContainerVariants = cva("input", {
  variants: {
    size: {
      md: "",
      sm: "",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

interface InputProps
  extends
    Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputContainerVariants> {
  /** Leading slot for an icon (rendered before the native `<input>`). */
  leading?: ReactNode;
  /** Trailing slot — most commonly a ⌘K hint `<span>`. */
  trailing?: ReactNode;
  /**
   * Override classes on the inner native `<input>`. The outer-wrapper
   * className is set via the standard `className` prop, matching the
   * convention every other primitive uses (className positions/sizes the
   * component as a whole; consumers rarely need to restyle the bare input).
   */
  inputClassName?: string;
}

/**
 * Generic input wrapped in a styled container with optional leading icon /
 * trailing hint. Forwards `ref` to the underlying `<input>` so callers can
 * focus it (e.g. ⌘K opens the search overlay and focuses its input).
 *
 * Conventions:
 *   - `className` + `style` apply to the outer wrapper so layout utilities
 *     (`w-full`, `mt-4`, etc.) behave as expected.
 *   - `inputClassName` opts into restyling the inner native `<input>`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, trailing, className, inputClassName, size, style, ...rest },
  ref,
) {
  // Size 'sm' tightens the wrapper (height 26px, smaller font).
  const sizeStyle =
    size === "sm" ? { height: 26, padding: "0 8px", fontSize: 12 } : undefined;

  return (
    <div
      className={cn(inputContainerVariants({ size }), className)}
      style={{ ...sizeStyle, ...style }}
    >
      {leading}
      <input ref={ref} className={cn(inputClassName)} {...rest} />
      {trailing}
    </div>
  );
});
