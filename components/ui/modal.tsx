import { type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Thin business wrapper around the BB registry Dialog.
 *
 * The wrapper keeps the plugin's compact header/body/footer contract, while
 * the actual overlay, focus handling, escape handling, portal, and compact
 * viewport behavior come from BB's official component. In particular, the
 * content is no longer a native top-layer dialog whose overflow clips nested
 * floating surfaces.
 *
 * `width` has to be asserted as a `max-width` as well. The registry's
 * DialogContent caps itself at a fixed max-width, and an inline `width` does
 * not beat a class-level `max-width` — so a dialog asking for a wide box
 * silently rendered at the cap instead.
 *
 * There is deliberately no forced height. The host composer is content-height
 * under `layout="document"`, so a definite height on the box would not give the
 * editor room — it would show as blank space under the composer.
 *
 * `allowOverflow` is for the one dialog whose content is a host compose
 * surface. The composer opens its slash panel as an absolutely positioned child
 * of its own prompt box, so a panel taller than the room below that box has to
 * escape the box — and any clipping ancestor between it and the viewport cuts
 * it off at the dialog's bottom edge instead. Measured on the running app: with
 * `overflow-hidden` the panel was painted down to y=788 against a box ending at
 * 790, and the rest of its 192px was not painted at all; with the two boxes this
 * wrapper owns left unclipped the whole panel paints, including the part past
 * the frame. bb's own layer inside the composer does not clip, so those two are
 * the whole of it — and the same panel in bb's full-page composer, where nothing
 * clips, is fully visible, which is the behaviour being matched.
 *
 * It is opt-in because not clipping means not scrolling: the container that
 * would scroll is also the container that would cut the panel, so a dialog can
 * have one or the other. Only the compose surface wants the panel; every other
 * dialog in the plugin draws ordinary content, which is meant to scroll inside
 * its box rather than spill out of it.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  busy = false,
  width = "46rem",
  allowOverflow = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
  busy?: boolean;
  /** Any CSS length; min() keeps it inside the viewport. */
  width?: string;
  /**
   * Let content past the box instead of scrolling inside it. Only for a dialog
   * holding a host surface whose own floating panels must escape.
   */
  allowOverflow?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const across = (value: string) => "min(" + value + ", calc(100vw - 2rem))";
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        style={{ width: across(width), maxWidth: across(width) }}
        className={cn(
          "flex max-h-[min(85vh,44rem)] flex-col gap-0 rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl",
          allowOverflow ? "overflow-visible" : "overflow-hidden",
        )}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center gap-2 border-b border-border px-3 py-2">
          {icon === undefined ? null : (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon name={icon} className="size-3.5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xs font-semibold">
              {title}
            </DialogTitle>
            {subtitle === undefined ? null : (
              <DialogDescription className="truncate text-2xs">
                {subtitle}
              </DialogDescription>
            )}
          </div>
          <DialogClose
            type="button"
            aria-label="Close"
            onClick={(event) => {
              if (busy) event.preventDefault();
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            <Icon name="CircleX" className="size-3.5" aria-hidden />
          </DialogClose>
        </DialogHeader>

        <div
          className={cn(
            "min-h-0 flex-1 p-3",
            allowOverflow ? "overflow-visible" : "overflow-y-auto",
          )}
        >
          {children}
        </div>

        {footer === undefined ? null : (
          <div className="shrink-0 border-t border-border px-3 py-2">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thin business wrapper for content-only confirmations that still need the
 * official BB Dialog's focus and portal behavior.
 */
export function PlainDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={cn(
          "max-h-[min(85vh,44rem)] overflow-y-auto rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl",
          className,
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
