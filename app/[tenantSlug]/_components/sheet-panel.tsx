"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** A controlled Radix Sheet with the site's header block (loaded lazily through lazy-ui). */
export default function SheetPanel({
  open,
  onOpenChange,
  side,
  className,
  title,
  titleClassName = "label-strong",
  description,
  descriptionClassName = "sr-only",
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "top" | "right" | "bottom" | "left";
  className: string;
  title: React.ReactNode;
  titleClassName?: string;
  description: React.ReactNode;
  descriptionClassName?: string;
  onCloseAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={className} onCloseAutoFocus={onCloseAutoFocus}>
        <SheetHeader className="px-0">
          <SheetTitle className={cn(titleClassName)}>{title}</SheetTitle>
          <SheetDescription className={cn(descriptionClassName)}>{description}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
