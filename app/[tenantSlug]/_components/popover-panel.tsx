"use client";

import { useCallback, useRef } from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export type Placement = { side: string; align: string } | null;

type ContentProps = Omit<React.ComponentProps<typeof PopoverContent>, "id" | "children">;

/**
 * A Radix Popover whose trigger lives outside it (see `popoverTriggerProps` in lazy-ui), so the trigger can
 * render, with Radix's own attributes, before this module loads. The two things Radix's PopoverTrigger would
 * otherwise contribute are mirrored from PopoverContentNonModal: a press on the trigger is not an outside
 * interaction, closing returns focus to the trigger unless the user interacted outside, and while the
 * content is mounted the trigger mirrors its placement (Radix's PopperAnchor attributes) via `onPlacement`.
 */
export default function PopoverPanel({
  open,
  onOpenChange,
  triggerRef,
  contentId,
  contentProps,
  onPlacement,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
  contentProps: ContentProps;
  onPlacement: (placement: Placement) => void;
  children: React.ReactNode;
}) {
  const interactedOutside = useRef(false);
  const pointerDownOutside = useRef(false);
  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const report = () => onPlacement({ side: node.dataset.side ?? "", align: node.dataset.align ?? "" });
      report();
      const observer = new MutationObserver(report);
      observer.observe(node, { attributes: true, attributeFilter: ["data-side", "data-align"] });
      return () => {
        observer.disconnect();
        onPlacement(null);
      };
    },
    [onPlacement],
  );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={triggerRef as React.RefObject<HTMLElement>} />
      <PopoverContent
        {...contentProps}
        id={contentId}
        ref={contentRef}
        onInteractOutside={(event) => {
          contentProps.onInteractOutside?.(event);
          if (!event.defaultPrevented) {
            interactedOutside.current = true;
            if (event.detail.originalEvent.type === "pointerdown") pointerDownOutside.current = true;
          }
          if (event.target instanceof Node && triggerRef.current?.contains(event.target)) event.preventDefault();
          if (event.detail.originalEvent.type === "focusin" && pointerDownOutside.current) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          contentProps.onCloseAutoFocus?.(event);
          if (!event.defaultPrevented) {
            if (!interactedOutside.current) triggerRef.current?.focus();
            event.preventDefault();
          }
          interactedOutside.current = false;
          pointerDownOutside.current = false;
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
