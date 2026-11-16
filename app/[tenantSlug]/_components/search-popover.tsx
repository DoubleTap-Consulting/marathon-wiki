"use client";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

/** The header search's suggestions popover, anchored to the search form (loaded lazily through lazy-ui). */
export default function SearchPopover({
  open,
  onClose,
  anchorRef,
  inputRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLFormElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  children: React.ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={(next) => !next && onClose()}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLFormElement>} />
      {/* Portaled to <body>, so it is labelled as a non-modal dialog rather than left outside every landmark. */}
      <PopoverContent
        role="dialog"
        aria-label="Search suggestions"
        align="end"
        sideOffset={6}
        className="max-h-[min(70vh,30rem)] w-[max(var(--radix-popover-trigger-width),420px)] overflow-y-auto p-0 data-[side=bottom]:slide-in-from-top-0 data-[state=open]:zoom-in-[0.98] data-[state=open]:duration-150 data-[state=open]:ease-[linear(0,0.051,0.169,0.312,0.458,0.594,0.711,0.81,0.89,0.952,1)] data-[state=closed]:zoom-out-100 data-[state=closed]:duration-100"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.target instanceof Node && inputRef.current?.form?.contains(event.target) && event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
