import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ScrollStrip } from "@/components/ui/scroll-strip";
import { StatusDot } from "@/components/inbox/family-status";
import { familyStatusPresentation, type FamilyStatusKind } from "@/lib/family-status";
import { groupScopeKey, type GroupScope } from "@/lib/groups";

export interface GroupTab {
  readonly scope: GroupScope;
  readonly label: string;
  readonly count: number;
  /**
   * The worst state anywhere under this tab, or null when nothing is under it.
   * A dot only — the tab strip answers "is anything moving" at a glance, and a
   * click still selects the scope rather than jumping anywhere.
   */
  readonly statusKind: FamilyStatusKind | null;
}

/**
 * The horizontal scope strip above the tree.
 *
 * It is a scope selector, not a second tree: picking a group narrows what the
 * tree below draws, and projects are still the first level inside it.
 *
 * Sizing is deliberate. These are the coarsest destination in the sidebar, so
 * they are one step larger than the rows beneath them (`h-7` / `text-xs`
 * against the rows' `text-2xs` metadata) — which also makes the strip the
 * natural reading order: scope, then project, then thread.
 *
 * The strip scrolls sideways rather than wrapping, because with many groups a
 * wrapped strip would push the actual thread list off screen. It hands that
 * scrolling to `ScrollStrip`, which keeps the bar hidden and fades whichever
 * edge still hides a tab, so the strip's height never changes.
 */
export function GroupTabs({
  tabs,
  activeKey,
  onSelect,
  onManage,
  onEdit,
  children,
}: {
  tabs: readonly GroupTab[];
  activeKey: string;
  onSelect: (scope: GroupScope) => void;
  onManage: () => void;
  /** Opens rename for the group a tab points at. Absent for All/Ungrouped. */
  onEdit: (groupId: string, name: string) => void;
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
      <ScrollStrip
        role="tablist"
        aria-label="Project groups"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const key = groupScopeKey(tab.scope);
          const selected = key === activeKey;
          const groupId = tab.scope.kind === "group" ? tab.scope.groupId : null;
          return (
            <span key={key} className="group/tab relative shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(tab.scope)}
                title={tab.label}
                className={cn(
                  "flex h-7 max-w-[9rem] items-center gap-1.5 rounded-md px-2 text-xs",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selected
                    ? "bg-sidebar-accent font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{tab.label}</span>
                <span className="shrink-0 tabular-nums text-2xs opacity-60">
                  {tab.count}
                </span>
                {tab.statusKind === null ? null : (
                  <span
                    // The dot is a summary, not a control: the containing tab
                    // already handles the click, so this must not steal it.
                    className={cn(
                      "flex shrink-0 items-center",
                      // Editing needs the room, so the dot steps aside rather
                      // than making the tab jitter between two widths.
                      groupId !== null && "group-hover/tab:hidden",
                    )}
                  >
                    <StatusDot status={familyStatusPresentation(tab.statusKind)} />
                  </span>
                )}
              </button>
              {groupId === null ? null : (
                <button
                  type="button"
                  aria-label={`Rename group ${tab.label}`}
                  title={`Rename ${tab.label}`}
                  onClick={() => onEdit(groupId, tab.label)}
                  className={cn(
                    "absolute right-1 top-1/2 hidden size-5 -translate-y-1/2 items-center justify-center rounded",
                    "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    "group-hover/tab:flex group-focus-within/tab:flex",
                  )}
                >
                  <Icon name="Edit" className="size-3" aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </ScrollStrip>
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
