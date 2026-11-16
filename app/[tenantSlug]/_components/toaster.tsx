"use client";

import { Toaster } from "@/components/ui/sonner";

/** The page's toast region (loaded lazily through lazy-ui). */
export default function PageToaster(props: React.ComponentProps<typeof Toaster>) {
  return <Toaster {...props} />;
}
