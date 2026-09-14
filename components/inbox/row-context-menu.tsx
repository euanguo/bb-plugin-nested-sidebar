import { Fragment, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { useThreadMenuActions } from "@/components/inbox/thread-menu-items";

/**
 * This sidebar's own right-click menu.
 *
 * The plugin API ships no menu component on purpose, so a replaced sidebar
 * owns this surface. The items come from `useThreadMenuActions`, the same hook
 * the row's own dropdown uses, so the two entrances to a thread can never
 * drift apart. The destructive item is `requestDelete`, which opens BB's
 * confirmation rather than deleting a subtree silently.
 */
export function RowContextMenu({
  thread,
  expanded = false,
  childCount = 0,
  canToggleChildren = false,
  onToggleChildren,
  onSettle,
  onSnooze,
  canPark = false,
  onUnarchive,
  splitAvailable = false,
  children,
}: {
  thread: PluginSidebarThread;
  /** Disclosure state, when the row has children to toggle. */
  expanded?: boolean;
  childCount?: number;
  canToggleChildren?: boolean;
  onToggleChildren?: () => void;
  onSettle?: () => void;
  onSnooze?: (snoozedUntil: number) => void;
  canPark?: boolean;
  /** Restore an archived thread; the plugin's lifecycle owns the inverse. */
  onUnarchive?: () => void;
  /** Whether the thread can open in a split pane. */
  splitAvailable?: boolean;
  children: ReactNode;
}) {
  const { items, dialog } = useThreadMenuActions({
    thread,
    expanded,
    childCount,
    canToggleChildren,
    onToggleChildren: onToggleChildren ?? (() => undefined),
    onSettle: onSettle ?? (() => undefined),
    onSnooze: onSnooze ?? (() => undefined),
    canPark,
    onUnarchive,
    splitAvailable,
  });

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            aria-label="Thread actions"
            className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {items.map((item) => (
              <Fragment key={item.key}>
                {item.separatorBefore ? <Separator /> : null}
                <Item
                  destructive={item.destructive ?? false}
                  onSelect={item.onSelect}
                >
                  {item.label}
                </Item>
              </Fragment>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {dialog}
    </>
  );
}

function Item({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive-text",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
