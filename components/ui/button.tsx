import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-ui font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border border-foreground bg-primary text-primary-foreground hover:bg-primary-hover dark:border-transparent",
        destructive:
          "border border-destructive bg-transparent text-destructive hover:bg-destructive/10",
        outline:
          "border border-input bg-card text-foreground hover:bg-muted",
        secondary:
          "border border-input bg-card text-foreground hover:bg-muted",
        ghost:
          "hover:bg-muted",
        link: "h-auto px-0 text-link underline decoration-1 underline-offset-4 hover:decoration-2",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:h-11",
        xs: "h-6 gap-1 px-2 text-label has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:h-11",
        lg: "h-10 px-6 has-[>svg]:px-4 pointer-coarse:h-11",
        icon: "size-9 pointer-coarse:size-11",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 pointer-coarse:size-11",
        "icon-lg": "size-10 pointer-coarse:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
