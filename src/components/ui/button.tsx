import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-[color,background-color,border-color,transform,opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-[var(--primary)] to-[#14a89a] !text-[var(--primary-foreground)] shadow-[0_10px_24px_-10px_rgba(10,98,104,0.5)] hover:opacity-90",
        secondary: "bg-[var(--accent-soft)] !text-[var(--accent-foreground)] hover:bg-[var(--accent-soft-hover)]",
        outline: "border border-[var(--border)] bg-[var(--surface)] !text-[var(--foreground)] hover:bg-[var(--surface-subtle)]",
        destructive: "bg-[var(--destructive)] !text-[var(--destructive-foreground)] hover:bg-[#8f1c14]",
        ghost: "!text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 px-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
