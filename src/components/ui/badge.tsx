import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        accent:
          "border-transparent bg-accent text-accent-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        success:
          "border-transparent bg-success text-success-foreground",
        warning:
          "border-transparent bg-warning text-warning-foreground",
        outline:
          "border-current text-foreground",
        muted:
          "border-transparent bg-muted text-muted-foreground",
        // Status badges for NomadNest
        applied:
          "border-transparent bg-muted text-muted-foreground",
        shortlisted:
          "border-transparent bg-secondary text-secondary-foreground",
        accepted:
          "border-transparent bg-primary text-primary-foreground",
        declined:
          "border-transparent bg-destructive text-destructive-foreground",
        published:
          "border-transparent bg-success text-success-foreground",
        draft:
          "border-transparent bg-muted text-muted-foreground",
        paused:
          "border-transparent bg-warning text-warning-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
