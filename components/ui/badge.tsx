import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "label inline-flex h-5 items-center border px-1.5",
  {
    variants: {
      variant: {
        default: "border-foreground bg-foreground text-background",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-input text-foreground",
        success:
          "border-diff-added/30 bg-diff-added-surface text-diff-added",
        warning: "border-claim-unverified/30 bg-claim-unverified/10 text-claim-unverified",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
