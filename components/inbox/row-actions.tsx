import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * The trailing controls every row shares.
 *
 * A row exposes at most TWO things: the one action frequent enough to deserve
 * its own button (`+` — start a thread here), and a menu holding everything
 * else. The menu trigger reads as a disclosure chevron at rest and as three
 * dots once the row is hovered or focused, so the chevron and the menu are one
 * slot rather than two competing affordances.
 *
 * Hover is tracked in React rather than with Tailwind group modifiers on
 * purpose: rows nest (a worktree inside a project), and CSS `group-hover`
 * fires for every ancestor group, which would light up a parent's menu while
 * the pointer is on a child.
 */
export function useRowReveal() {
  const [pointer, setPointer] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  return {
    revealed: pointer || focus,
    handlers: {
      onPointerEnter: () => setPointer(true),
      onPointerLeave: () => setPointer(false),
      onFocusCapture: () => setFocus(true),
      onBlurCapture: () => setFocus(false),
    },
  };
}

/** A frequent, always-visible row action. */
export function RowActionButton({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-bb-icon-button=""
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      <Icon name={icon} className="size-3" aria-hidden />
    </button>
  );
}

/**
 * The chevron/dots trigger. Forwarded ref because Radix's `asChild` clones
 * this element and needs to attach its own ref and event handlers.
 */
export const RowMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    /** Render a disclosure chevron when the row is at rest. */
    chevron?: boolean;
    expanded?: boolean;
    /** True while the row is hovered/focused or its menu is open. */
    revealed?: boolean;
    className?: string;
  } & React.ComponentPropsWithoutRef<"button">
>(function RowMenuTrigger(
  { label, chevron = false, expanded = false, revealed = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      title={label}
      data-bb-icon-button=""
      className={cn(
        "relative z-10 flex size-5 shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        revealed && "text-foreground",
        className,
      )}
      {...props}
    >
      {chevron ? (
        <Icon
          name="ChevronDown"
          className={cn(
            "size-3 transition-transform duration-150 ease-out motion-reduce:transition-none",
            expanded && "rotate-180",
            revealed && "hidden",
          )}
          aria-hidden
        />
      ) : null}
      <Icon
        name="More"
        className={cn("size-3", revealed ? "block" : "hidden")}
        aria-hidden
      />
    </button>
  );
});

/** The trailing cluster: an optional primary action, then the menu trigger. */
export function RowActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ml-auto flex min-w-0 shrink-0 items-center justify-end gap-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}
