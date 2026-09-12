import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";

/**
 * The plugin's stacking ladder, in one place.
 *
 * Everything that floats is portaled to the document body, which is what makes
 * this ladder meaningful: inside the sidebar the tree competes with bb's own
 * sticky stack (its project and label tiers sit at 50 and above), and no
 * hand-rolled `absolute` layer can out-rank that reliably. A portal puts these
 * surfaces in the root stacking context instead, where a plain z-index decides.
 *
 * So the order is fixed here rather than guessed per call site:
 *
 *   menu / hover card   50  - a menu opens above the tree it belongs to
 *   dialog              60  - a modal covers an open menu behind it
 *   dialog submenu      70  - a second-level menu inside a dialog stays on top
 */
export const Z_MENU = "z-50";
export const Z_DIALOG = "z-[60]";
export const Z_DIALOG_SUBMENU = "z-[70]";

export const MENU_CONTENT_CLASS = cn(
  Z_MENU,
  "min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1",
  "text-popover-foreground shadow-lg",
);

/** A menu that opens from a trigger and renders in the root stacking context. */
export function Menu({
  trigger,
  open,
  onOpenChange,
  label,
  align = "end",
  side = "bottom",
  children,
}: {
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  const scope = usePortalScopeProps();
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...scope}
          aria-label={label}
          align={align}
          side={side}
          sideOffset={4}
          collisionPadding={8}
          className={MENU_CONTENT_CLASS}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  icon,
  label,
  destructive = false,
  disabled = false,
  onSelect,
}: {
  icon?: Parameters<typeof Icon>[0]["name"];
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-default select-none items-center gap-2 px-2 py-1 text-xs outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        destructive && "text-destructive",
      )}
    >
      {icon === undefined ? (
        <span aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <Icon
          name={icon}
          className={cn(
            "size-3.5 shrink-0",
            destructive ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenu.Item>
  );
}

/** A row inside a "move to group" submenu: the current group is ticked. */
export function MenuCheckboxItem({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      onSelect={onSelect}
      className={cn(
        "flex cursor-default select-none items-center gap-2 px-2 py-1 text-xs outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
      )}
    >
      <Icon
        name="FolderTree"
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <DropdownMenu.ItemIndicator>
        <Icon name="Check" className="size-3.5 text-primary" aria-hidden />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.CheckboxItem>
  );
}

/** A second-level menu. Radix portals it separately, above the parent menu. */
export function MenuSub({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: Parameters<typeof Icon>[0]["name"];
  children: React.ReactNode;
}) {
  const scope = usePortalScopeProps();
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger
        className={cn(
          "flex cursor-default select-none items-center gap-2 px-2 py-1 text-xs outline-none",
          "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
          "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        )}
      >
        {icon === undefined ? (
          <span aria-hidden className="size-3.5 shrink-0" />
        ) : (
          <Icon
            name={icon}
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icon
          name="ChevronRight"
          className="size-3.5 text-muted-foreground"
          aria-hidden
        />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          {...scope}
          aria-label={label}
          sideOffset={2}
          collisionPadding={8}
          className={MENU_CONTENT_CLASS}
        >
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border/70" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </DropdownMenu.Label>
  );
}
