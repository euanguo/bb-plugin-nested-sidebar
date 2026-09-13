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
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  busy = false,
  width = "46rem",
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
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        style={{ width: "min(" + width + ", calc(100vw - 2rem))" }}
        className={cn(
          "flex max-h-[min(85vh,44rem)] flex-col gap-0 overflow-hidden rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl",
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

        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>

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
