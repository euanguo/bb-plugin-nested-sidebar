import { useId, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RollupJump } from "@/components/inbox/rollup-badge";
import {
  ProjectNode as ProjectNodeView,
} from "@/components/inbox/project-node";
import type { GroupNode } from "@/lib/tree";
import type { ProjectGroup } from "@/lib/groups";
import type {
  TreeRowHandlers,
  WorkspaceLaunch,
} from "@/components/inbox/tree-rows";

/**
 * One group: the header row plus the projects filed under it.
 *
 * The header is the only place a project's group membership is edited from —
 * a project moves between groups through its own row's menu — so this row
 * carries just three things: the name, how many projects are inside, and the
 * merged status of every thread underneath. The last one is the reason the
 * level exists at all: with the group collapsed, a single dot plus a count is
 * the whole answer to "is anything in here running or waiting on me?".
 */
export function GroupSection({
  node,
  handlers,
  groups,
  onAssignGroup,
  onNewThreadInProject,
  onNewThreadInWorkspace,
  projectColorOverrides,
  projectReorder,
}: {
  node: GroupNode;
  handlers: TreeRowHandlers;
  groups: readonly ProjectGroup[];
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
  const listId = useId();
  const threadCount = node.projects.reduce(
    (total, project) =>
      total +
      project.families.reduce(
        (sum, family) => sum + 1 + family.children.length,
        0,
      ),
    0,
  );

  return (
    <section
      aria-label={node.name}
      data-nested-group={node.groupId ?? "__ungrouped__"}
      className="mb-1"
    >
      <div className="group/group flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 hover:bg-sidebar-accent/50">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          title={node.name}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            name="Layer"
            className="size-3.5 shrink-0 text-muted-foreground/70"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-foreground/80">
            {node.name}
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
          aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
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
        <div id={listId}>
          {node.projects.map((project) => (
            <ProjectNodeView
              key={project.project.id}
              node={project}
              handlers={handlers}
              groups={groups}
              currentGroupId={node.groupId}
              onAssignGroup={onAssignGroup}
              onNewThreadInProject={onNewThreadInProject}
              onNewThreadInWorkspace={onNewThreadInWorkspace}
              projectColorOverrides={projectColorOverrides}
              projectReorder={projectReorder}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
