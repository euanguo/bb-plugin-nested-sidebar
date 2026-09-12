import { useId, useState, type DragEvent } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ThreadCard } from "@/components/inbox/thread-card";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import { RollupJump } from "@/components/inbox/rollup-badge";
import type { LifecycleApi } from "@/hooks/use-lifecycle";
import type { ThreadFamily } from "@/lib/inbox";
import type { WorkspaceNode } from "@/lib/tree";
import type { RootSelectionIntent } from "@/lib/thread-management";
import { BULK_PROTECTION_LABELS, bulkEligibility } from "@/lib/thread-management";
import type { NestPreferences } from "@/lib/preferences";

export interface TreeRowHandlers {
  readonly providerInfoById: ReadonlyMap<string, ProviderGlyphInfo>;
  readonly activeThreadId: string | null;
  readonly forceExpanded: boolean;
  readonly lifecycle: LifecycleApi;
  readonly onNavigate: () => void;
  readonly now: number;
  readonly selectionMode: boolean;
  readonly selectedRootIds: ReadonlySet<string>;
  readonly selectionHintId: string;
  readonly onToggleRoot: (threadId: string, intent: RootSelectionIntent) => void;
  /** Opens the new-thread dialog seeded from a workspace row. */
  readonly onNewThreadInWorkspace: (launch: WorkspaceLaunch) => void;
  readonly preferences: NestPreferences;
  /** Family reordering is disabled by selection, filters, and host search. */
  readonly reorderEnabled: boolean;
  readonly reorderDisabledReason: string | null;
  readonly onReorder: (input: FamilyReorderInput) => void;
  readonly onKeyboardMove: (
    projectId: string,
    rootId: string,
    direction: -1 | 1,
  ) => void;
  readonly projectReorderEnabled: boolean;
  readonly projectReorderDisabledReason: string | null;
  readonly onProjectReorder: (input: ProjectReorderInput) => void;
  readonly onProjectKeyboardMove: (
    projectId: string,
    direction: -1 | 1,
  ) => void;
}

export interface FamilyReorderInput {
  readonly sourceProjectId: string;
  readonly sourceRootId: string;
  readonly targetProjectId: string;
  readonly targetRootId: string;
  readonly position: "before" | "after";
}

export interface ProjectReorderInput {
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly position: "before" | "after";
}

/**
 * A workspace row's + carries both the workspace to reuse and the project it
 * belongs to, because the dialog's project picker must be seeded from the row
 * the user actually clicked rather than from whatever project is on screen.
 */
export interface WorkspaceLaunch {
  readonly node: WorkspaceNode;
  readonly projectId: string;
  readonly projectName: string;
}

/**
 * One workspace: a worktree, the project checkout, or the no-workspace bucket.
 *
 * Collapsed by default when a project has several, because the whole point of
 * this level is to make many worktrees navigable rather than to show them all
 * at once.
 */
export function WorkspaceGroup({
  node,
  projectId,
  projectName,
  handlers,
}: {
  node: WorkspaceNode;
  projectId: string;
  projectName: string;
  handlers: TreeRowHandlers;
}) {
  const actions = useSidebarThreadActions();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const threadCount = node.families.reduce(
    (total, family) => total + 1 + family.children.length,
    0,
  );

  return (
    <section aria-label={node.ref.label}>
      <div className="group/ws flex h-7 w-full items-center gap-1.5 rounded-md pl-4 pr-1.5 hover:bg-sidebar-accent/50">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={node.ref.label}
        >
          <Icon
            name="GitBranch"
            className="size-3 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">
            {node.ref.label}
          </span>
        </button>
        <RollupJump
          rollup={node.rollup}
          onJump={(threadId) => {
            actions.open(threadId);
            handlers.onNavigate();
          }}
          onFallback={() => setExpanded((open) => !open)}
        />
        <span className="shrink-0 tabular-nums text-2xs text-muted-foreground/60">
          {threadCount}
        </span>
        <button
          type="button"
          aria-label={`New thread in ${node.ref.label}`}
          title={`New thread in ${node.ref.label}`}
          onClick={() =>
            handlers.onNewThreadInWorkspace({ node, projectId, projectName })
          }
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground group-hover/ws:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="Add" className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${node.ref.label}`}
          onClick={() => setExpanded((open) => !open)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            name="ChevronDown"
            className={cn("size-3 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {expanded ? (
        <ul id={listId} className="flex flex-col gap-0.5">
          {node.families.map((family) => (
            <FamilyRow
              key={family.root.id}
              family={family}
              projectId={projectId}
              handlers={handlers}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function FamilyRow({
  family,
  projectId,
  handlers,
}: {
  family: ThreadFamily;
  projectId: string;
  handlers: TreeRowHandlers;
}) {
  const eligibility = bulkEligibility(family, handlers.activeThreadId);
  return (
    <ThreadCard
      thread={family.root}
      childThreads={family.children}
      providerInfoById={handlers.providerInfoById}
      activeThreadId={handlers.activeThreadId}
      canPark={handlers.lifecycle.canPark(family.root)}
      forceExpanded={handlers.forceExpanded}
      onNavigate={handlers.onNavigate}
      onSettle={() => handlers.lifecycle.settle(family.root.id)}
      onSnooze={(until) => handlers.lifecycle.snooze(family.root.id, until)}
      now={handlers.now}
      selectionMode={handlers.selectionMode}
      selected={handlers.selectedRootIds.has(family.root.id)}
      selectionHintId={handlers.selectionHintId}
      selectionDisabledReason={
        eligibility.eligible
          ? null
          : BULK_PROTECTION_LABELS[eligibility.reason]
      }
      onToggleSelected={(intent) => handlers.onToggleRoot(family.root.id, intent)}
      reorderEnabled={handlers.reorderEnabled}
      reorderDisabledReason={handlers.reorderDisabledReason}
      onMoveByKeyboard={(direction) =>
        handlers.onKeyboardMove(projectId, family.root.id, direction)
      }
      onReorderDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-nest-family",
          JSON.stringify({ projectId, rootId: family.root.id }),
        );
      }}
      onReorderDragOver={(event) => {
        if (!handlers.reorderEnabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onReorderDrop={(event) => {
        event.preventDefault();
        const dragged = parseDraggedFamily(
          event.dataTransfer.getData("application/x-nest-family"),
        );
        if (dragged === null) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        handlers.onReorder({
          sourceProjectId: dragged.projectId,
          sourceRootId: dragged.rootId,
          targetProjectId: projectId,
          targetRootId: family.root.id,
          position:
            event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        });
      }}
      preferences={handlers.preferences}
    />
  );
}

/** Flat rendering used when a project occupies a single workspace. */
export function FlatFamilies({
  families,
  projectId,
  handlers,
}: {
  families: readonly ThreadFamily[];
  projectId: string;
  handlers: TreeRowHandlers;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {families.map((family) => (
        <FamilyRow
          key={family.root.id}
          family={family}
          projectId={projectId}
          handlers={handlers}
        />
      ))}
    </ul>
  );
}

/** Parses the drag payload a family row puts on the data transfer. */
export function parseDraggedFamily(
  raw: string,
): { projectId: string; rootId: string } | null {
  if (raw.length === 0 || raw.length > 1_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("projectId" in parsed) ||
      !("rootId" in parsed) ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.rootId !== "string"
    ) {
      return null;
    }
    return { projectId: parsed.projectId, rootId: parsed.rootId };
  } catch {
    return null;
  }
}

export type { PluginSidebarThread, DragEvent };
