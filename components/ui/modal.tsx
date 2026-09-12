import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * A modal dialog the user can always get out of.
 *
 * Every escape hatch is wired unconditionally, on purpose: Escape is native to
 * `<dialog>`, the close button is always rendered, and a click on the backdrop
 * closes it. Nothing here is gated on "is there content yet" or "is the body
 * ready", because that is exactly how a dialog strands the user. A dialog with
 * a slow or failed child still closes.
 *
 * `busy` is the one exception, and it is deliberately narrow: it holds the
 * dialog open only while an operation is mid-flight, and it never disables
 * Escape — aborting is always available.
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
  /** Any CSS length; `min()` keeps it inside the viewport. */
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click that lands on the dialog element itself — rather than on anything
  // inside it — is a backdrop click. Tracking the press start stops a drag that
  // began inside the body and ended outside from being read as one.
  const pressedOnBackdrop = useRef(false);
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pressedOnBackdrop.current = event.target === event.currentTarget;
  }, []);
  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (event.target !== event.currentTarget) return;
      if (!pressedOnBackdrop.current) return;
      pressedOnBackdrop.current = false;
      onClose();
    },
    [onClose],
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-nest-modal=""
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      // Native Escape fires `cancel`; closing is always allowed, and only a
      // mid-flight write asks to be left alone.
      onCancel={(event) => {
        event.preventDefault();
        if (busy) return;
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      style={{ width: `min(${width}, calc(100vw - 2rem))` }}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 m-0 flex max-h-[min(85vh,44rem)] -translate-x-1/2 -translate-y-1/2",
        "flex-col overflow-hidden rounded-xl border border-border bg-popover p-0",
        "text-popover-foreground shadow-xl backdrop:bg-surface-scrim/80",
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {icon === undefined ? null : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon name={icon} className="size-3.5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xs font-semibold">
            {title}
          </h2>
          {subtitle === undefined ? null : (
            <p className="truncate text-2xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="CircleX" className="size-3.5" aria-hidden />
        </button>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {children}
      </div>

      {footer === undefined ? null : (
        <div className="shrink-0 border-t border-border px-3 py-2">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/**
 * A dialog that never mounts its body until the feature is ready, without
 * ever becoming a dialog the user cannot close. Kept separate from `Modal`
 * so the escape hatches stay unconditional there.
 */
export function PlainDialog({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 m-0 -translate-x-1/2 -translate-y-1/2",
        "rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl",
        "backdrop:bg-surface-scrim/80",
        className,
      )}
    >
      {children}
    </dialog>
  );
}
