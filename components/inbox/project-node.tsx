import { useId, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RollupJump } from "@/components/inbox/rollup-badge";
import {
  FlatFamilies,
  WorkspaceGroup,
  parseDraggedFamily,
  type TreeRowHandlers,
  type WorkspaceLaunch,
} from "@/components/inbox/tree-rows";
import type { ProjectNode as ProjectNodeModel } from "@/lib/tree";
import type { ProjectGroup } from "@/lib/groups";
import {
  projectBadgeLetter,
  projectBadgePresentation,
} from "@/lib/project-colors";

/**
 * One project. The workspace level appears only when the project's threads
 * actually occupy more than one, so a single-checkout project stays flat.
 */
export function ProjectNode({
  node,
  handlers,
  groups,
  currentGroupId,
  onAssignGroup,
  onNewThreadInProject,
  onNewThreadInWorkspace,
  projectColorOverrides,
  projectReorder,
}: {
  node: ProjectNodeModel;
  handlers: TreeRowHandlers;
  groups: readonly ProjectGroup[];
  currentGroupId: string | null;
  onAssignGroup: (projectId: string, groupId: string | null) => void;
  onNewThreadInProject: (projectId: string, projectName: string) => void;
  onNewThreadInWorkspace: (launch: WorkspaceLaunch) => void;
  projectColorOverrides: ReadonlyMap<string, string>;
  projectReorder: {
    enabled: boolean;
    next: (projectId: string, delta: -1 | 1) => void;
    drop: (
      sourceProjectId: string,
      targetProjectId: string,
      position: "before" | "after",
    ) => void;
  };
}) {
  const actions = useSidebarThreadActions();
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const listId = useId();
  const dragStarted = useRef(false);
  const badge = projectBadgePresentation(
    node.project.id,
    projectColorOverrides.get(node.project.id),
  );
  const threadCount = node.families.reduce(
    (total, family) => total + 1 + family.children.length,
    0,
  );

  const workspaceHandlers: TreeRowHandlers = {
    ...handlers,
    onNewThreadInWorkspace,
  };

  return (
    <section
      aria-label={node.project.name}
      data-nest-project={node.project.id}
      className="mt-1 first:mt-0"
      onDragOver={(event) => {
        // A project row is a drop target for another project header, and for a
        // thread family dragged in from anywhere in the group.
        const types = event.dataTransfer.types;
        const projectDrag = types.includes("application/x-nest-project");
        const familyDrag = types.includes("application/x-nest-family");
        if (!projectDrag && !familyDrag) return;
        if (projectDrag && !projectReorder.enabled) return;
        if (familyDrag && !handlers.reorderEnabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const bounds = event.currentTarget.firstElementChild?.getBoundingClientRect();
        const position =
          bounds && event.clientY >= bounds.top + bounds.height / 2
            ? "after"
            : "before";

        const projectRaw = event.dataTransfer.getData(
          "application/x-nest-project",
        );
        if (projectRaw.length > 0) {
          const dragged = parseDraggedProject(projectRaw);
          if (dragged === null || !projectReorder.enabled) return;
          event.preventDefault();
          event.stopPropagation();
          projectReorder.drop(dragged.projectId, node.project.id, position);
          return;
        }

        // A family dropped on the project header lands at the top or bottom of
        // the project's own family list — the same gesture as dropping it on
        // the first or last row, without needing to aim at a row.
        const dragged = parseDraggedFamily(
          event.dataTransfer.getData("application/x-nest-family"),
        );
        if (dragged === null || !handlers.reorderEnabled) return;
        const target = node.families.at(position === "before" ? 0 : -1);
        if (target === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        handlers.onReorder({
          sourceProjectId: dragged.projectId,
          sourceRootId: dragged.rootId,
          targetProjectId: node.project.id,
          targetRootId: target.root.id,
          position,
        });
      }}
    >
      <div className="group/project relative flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 hover:bg-sidebar-accent/60">
        <button
          type="button"
          draggable={projectReorder.enabled}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${node.project.name}. ${projectReorder.enabled ? "Drag this header to reorder projects, or press Alt+Up or Alt+Down." : "Project reordering is unavailable."}`}
          title={node.project.name}
          onClick={(event) => {
            if (dragStarted.current) {
              event.preventDefault();
              return;
            }
            setExpanded((open) => !open);
          }}
          onDragStart={(event) => {
            if (!projectReorder.enabled) {
              event.preventDefault();
              return;
            }
            dragStarted.current = true;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-nest-project",
              JSON.stringify({ projectId: node.project.id }),
            );
          }}
          onDragEnd={() => {
            setTimeout(() => {
              dragStarted.current = false;
            }, 0);
          }}
          onKeyDown={(event) => {
            if (!event.altKey) return;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              projectReorder.next(
                node.project.id,
                event.key === "ArrowUp" ? -1 : 1,
              );
            }
          }}
          className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <span
          aria-hidden
          data-nest-project-badge={node.project.id}
          className="pointer-events-none relative flex size-5 shrink-0 items-center justify-center rounded-md border border-black/15 text-2xs font-semibold uppercase shadow-sm"
          style={{
            backgroundColor: badge.backgroundColor,
            color: badge.foregroundColor,
          }}
        >
          {projectBadgeLetter(node.project.name)}
        </span>
        <span className="pointer-events-none relative min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">
          {node.project.name}
        </span>
        <span className="pointer-events-none relative shrink-0 tabular-nums text-2xs text-muted-foreground/60">
          {threadCount}
        </span>
        <RollupJump
          rollup={node.rollup}
          onJump={(threadId) => {
            actions.open(threadId);
            handlers.onNavigate();
          }}
          onFallback={() => setExpanded((open) => !open)}
        />
        <div className="relative">
          <button
            type="button"
            aria-label={`Actions for ${node.project.name}`}
            title="Project actions"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 hover:bg-sidebar-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon name="More" className="size-3" aria-hidden />
          </button>
          {menuOpen ? (
            <ProjectMenu
              groups={groups}
              currentGroupId={currentGroupId}
              onPick={(groupId) => {
                setMenuOpen(false);
                onAssignGroup(node.project.id, groupId);
              }}
              onClose={() => setMenuOpen(false)}
            />
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`New thread in ${node.project.name}`}
          title={`New thread in ${node.project.name}`}
          onClick={() => onNewThreadInProject(node.project.id, node.project.name)}
          className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-sidebar-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon name="Add" className="size-3" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={
            `${expanded ? "Collapse" : "Expand"} ${node.project.name}`
          }
          onClick={() => setExpanded((open) => !open)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      {expanded ? (
        node.showWorkspaces ? (
          <div id={listId} className="mt-0.5 flex flex-col gap-0.5">
            {node.workspaces.map((workspace) => (
              <WorkspaceGroup
                key={workspace.ref.key}
                node={workspace}
                projectId={node.project.id}
                projectName={node.project.name}
                handlers={workspaceHandlers}
              />
            ))}
          </div>
        ) : (
          <div id={listId} className="mt-0.5">
            <FlatFamilies
              families={node.families}
              projectId={node.project.id}
              handlers={workspaceHandlers}
            />
          </div>
        )
      ) : null}
    </section>
  );
}

/**
 * Which group this project lives in, plus the escape hatch back to ungrouped.
 * A plain popover rather than a nested menu: there is one decision to make.
 */
function parseDraggedProject(raw: string): { projectId: string } | null {
  if (raw.length === 0 || raw.length > 500) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("projectId" in parsed) ||
      typeof parsed.projectId !== "string"
    ) {
      return null;
    }
    return { projectId: parsed.projectId };
  } catch {
    return null;
  }
}

function ProjectMenu({
  groups,
  currentGroupId,
  onPick,
  onClose,
}: {
  groups: readonly ProjectGroup[];
  currentGroupId: string | null;
  onPick: (groupId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-30 cursor-default"
      />
      <div className="absolute right-0 top-full z-40 mt-0.5 min-w-40 rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg">
        <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Group
        </p>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onPick(group.id)}
            className={cn(
              "flex w-full items-center gap-2 px-2 py-1 text-left text-xs",
              "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
            )}
          >
            <Icon
              name="FolderTree"
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{group.name}</span>
            {group.id === currentGroupId ? (
              <Icon name="Check" className="size-3.5 text-primary" aria-hidden />
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex w-full items-center gap-2 border-t border-border/70 px-2 py-1 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        >
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Ungrouped
          </span>
          {currentGroupId === null ? (
            <Icon name="Check" className="size-3.5 text-primary" aria-hidden />
          ) : null}
        </button>
      </div>
    </>
  );
}
