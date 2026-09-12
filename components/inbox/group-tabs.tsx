import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { groupScopeKey, type GroupScope } from "@/lib/groups";

export interface GroupTab {
  readonly scope: GroupScope;
  readonly label: string;
  readonly count: number;
}

/**
 * The horizontal scope strip above the tree.
 *
 * It is a scope selector, not a second tree: picking a group narrows what the
 * tree below draws, and projects are still the first level inside it. Tabs
 * scroll horizontally rather than wrapping, because with many groups a wrapped
 * strip would push the actual thread list off the screen.
 */
export function GroupTabs({
  tabs,
  activeKey,
  onSelect,
  onManage,
  children,
}: {
  tabs: readonly GroupTab[];
  activeKey: string;
  onSelect: (scope: GroupScope) => void;
  onManage: () => void;
  /**
   * Trailing controls for the strip. The project count and these actions used
   * to sit on their own "PROJECTS" row below the tabs, which repeated what the
   * tab counts already say; folding them in here gives the thread list that
   * row back.
   */
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-1.5 pb-1">
      <div
        role="tablist"
        aria-label="Project groups"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const key = groupScopeKey(tab.scope);
          const selected = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.scope)}
              title={tab.label}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                selected
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <span className="max-w-[7rem] truncate">{tab.label}</span>
              <span className="tabular-nums opacity-60">{tab.count}</span>
            </button>
          );
        })}
      </div>
      {children === undefined ? null : (
        <span className="flex shrink-0 items-center gap-0.5">{children}</span>
      )}
      <button
        type="button"
        aria-label="Manage groups"
        title="Manage groups"
        onClick={onManage}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground",
          "hover:bg-sidebar-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      >
        <Icon name="FolderAdd" className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
