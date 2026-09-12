import * as React from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { Z_MENU } from "@/components/ui/menu";

/**
 * A hover card for the details a row suppresses.
 *
 * Rows are dense by design, so everything that is not a title is either a dot
 * or hidden here. Two properties make this family of surface usable in a
 * sidebar:
 *
 * - It is portaled, so it escapes the sidebar's own stacking context and the
 *   scroll container's clipping.
 * - Radix runs collision detection, so a card opened near the right edge flips
 *   inward instead of spilling off screen.
 *
 * The open delay is short but non-zero: passing the pointer over a row on the
 * way somewhere else should not flash a panel.
 */
export function InfoCard({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const scope = usePortalScopeProps();
  return (
    <HoverCard.Root openDelay={350} closeDelay={80}>
      <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          {...scope}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            Z_MENU,
            "w-72 rounded-lg border border-border bg-popover p-2.5",
            "text-popover-foreground shadow-lg",
            className,
          )}
        >
          {children}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/** One label/value line inside an info card. */
export function InfoRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="w-16 shrink-0 text-2xs text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 select-text break-all text-2xs text-foreground/90",
          mono && "font-mono",
        )}
      >
        {children}
      </span>
    </div>
  );
}

/** A selectable value with a copy button, for ids and filesystem paths. */
export function InfoCopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="group/copy flex min-w-0 items-baseline gap-2">
      <span className="w-16 shrink-0 text-2xs text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 select-text break-all font-mono text-2xs text-foreground/90">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        title={copied ? "Copied" : "Copy"}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            },
            () => undefined,
          );
        }}
        className="shrink-0 rounded p-0.5 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/copy:opacity-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
