import * as React from "react";

import { cn } from "@/lib/utils";

// 16px text on phones keeps iOS from zooming the page on focus.
const field =
  "w-full min-w-0 border border-input bg-card px-3 text-body text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive md:text-ui";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(field, "h-9 pointer-coarse:h-11", className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(field, "min-h-24 resize-y py-2", className)} {...props} />;
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(field, "h-9 pointer-coarse:h-11", className)} {...props} />;
}

export { Input, Select, Textarea };
