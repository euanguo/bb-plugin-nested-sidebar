import { useCallback, useState, type ReactNode } from "react";
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
  const [overflowing, setOverflowing] = useState(false);
  // Do not feed the compact layout back into the measurement that selected it.
  // Once labels have proved that the strip is too narrow, measuring the much
  // narrower icon layout would otherwise report "fits", switch back to labels,
  // report "overflows", and oscillate indefinitely. The compact state resets
  // only when the tab collection itself changes.
  const handleOverflowChange = useCallback((next: boolean) => {
    if (next) setOverflowing(true);
  }, []);
  const handleContainerResize = useCallback(() => {
    setOverflowing(false);
  }, []);
  return (
    <div className="flex shrink-0 items-center gap-1 px-1.5 pb-1">
      <ScrollStrip
        role="tablist"
        aria-label="Project groups"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        onOverflowChange={handleOverflowChange}
        onContainerResize={handleContainerResize}
      >
        {tabs.map((tab) => {
          const key = groupScopeKey(tab.scope);
          const selected = key === activeKey;
          return (
            <span key={key} className="shrink-0">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(tab.scope)}
                title={tab.label}
                className={cn(
                  overflowing
                    ? "flex size-6 items-center justify-center rounded-md px-1 text-2xs"
                    : "flex h-6.5 max-w-[9rem] items-center gap-1.5 rounded-md px-1.5 text-2xs",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selected
                    ? "bg-sidebar-accent font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {overflowing ? (
                  <Icon
                    name={
                      tab.scope.kind === "all"
                        ? "Eye"
                        : tab.scope.kind === "ungrouped"
                          ? "FolderTree"
                          : "Layer"
                    }
                    className="size-3.5"
                    aria-hidden
                  />
                ) : (
                  <span className="truncate">{tab.label}</span>
                )}
                {tab.statusKind === null ? null : (
                  <span className="flex shrink-0 items-center">
                    <StatusDot status={familyStatusPresentation(tab.statusKind)} />
                  </span>
                )}
              </button>
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
