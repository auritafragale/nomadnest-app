import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground shadow-soft hover:bg-secondary/90 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
        destructive:
          "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        outline:
          "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground",
        "outline-secondary":
          "border-2 border-secondary text-secondary bg-transparent hover:bg-secondary hover:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        hero:
          "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-1 active:translate-y-0 text-base",
        "hero-secondary":
          "bg-surface text-foreground border-2 border-border shadow-soft hover:border-primary hover:text-primary hover:-translate-y-1 active:translate-y-0 text-base",
        accent:
          "bg-accent text-accent-foreground shadow-soft hover:bg-accent/90 hover:shadow-lg",
        success:
          "bg-success text-success-foreground shadow-soft hover:bg-success/90",
        warning:
          "bg-warning text-warning-foreground shadow-soft hover:bg-warning/90",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
