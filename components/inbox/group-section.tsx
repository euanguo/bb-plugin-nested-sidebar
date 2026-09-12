import { useId, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
} from "@get-bb/plugin-sdk/app";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { InfoCard, InfoRow } from "@/components/ui/hover-card";
import {
  RowMenuTrigger,
  RowActions,
  useRowReveal,
} from "@/components/inbox/row-actions";
import { RollupJump } from "@/components/inbox/rollup-badge";
import {
  ProjectNode as ProjectNodeView,
} from "@/components/inbox/project-node";
import type { GroupNode } from "@/lib/tree";
import { renameIntent, type ProjectGroup } from "@/lib/groups";
import type {
  TreeRowHandlers,
  WorkspaceLaunch,
} from "@/components/inbox/tree-rows";

/**
 * One group: the header row plus the projects filed under it.
 *
 * The header is the only place a project's group membership is edited from —
 * a project moves between groups through its own row's menu — so this row
 * carries the name, how many projects are inside, and the merged status of
 * every thread underneath. The last one is the reason the level exists at all:
 * with the group collapsed, a single dot plus a count is the whole answer to
 * "is anything in here running or waiting on me?".
 *
 * The name is edited in place. The pencil sits *before* the name so the
 * affordance reads as part of the label rather than as a trailing control, and
 * it only becomes a button once the row is hovered: at rest it is a quiet
 * glyph, so a screenful of groups is not a screenful of buttons. Clicking it
 * swaps the label for an input, which commits on Enter or blur and abandons on
 * Escape — the same rules the group manager dialog applies, shared through
 * `renameIntent` so the two cannot drift.
 */
export function GroupSection({
  node,
  handlers,
  groups,
  onAssignGroup,
  onNewThreadInProject,
  onNewWorktree,
  onNewThreadInWorkspace,
  projectColorOverrides,
  projectReorder,
  onRenameGroup,
}: {
  node: GroupNode;
  handlers: TreeRowHandlers;
  groups: readonly ProjectGroup[];
  onAssignGroup: (projectId: string, groupId: string | null) => void;
  onNewThreadInProject: (projectId: string, projectName: string) => void;
  onNewWorktree: (projectId: string, projectName: string) => void;
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
  onRenameGroup: (groupId: string, name: string) => void;
}) {
  const actions = useSidebarThreadActions();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const reveal = useRowReveal();
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
  const projectCount = node.projects.length;
  const groupId = node.groupId;

  const header = (
    <div
      {...reveal.handlers}
      className="group/group flex h-7 w-full items-center gap-2 rounded-md px-1.5 hover:bg-sidebar-accent/50"
    >
      {editing && groupId !== null ? (
        <GroupNameField
          name={node.name}
          onCommit={(draft) => {
            const name = renameIntent(draft, node.name);
            setEditing(false);
            if (name !== null) onRenameGroup(groupId, name);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          title={node.name}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* Before the name, not after: the pencil belongs to the label. It
              is inert until the row is hovered, then becomes the edit entry. */}
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70"
            aria-hidden={!reveal.revealed}
          >
            <span className="group-hover/group:hidden group-focus-within/group:hidden">
              <Icon name="Layer" className="size-3.5" aria-hidden />
            </span>
            <button
              type="button"
              tabIndex={reveal.revealed && groupId !== null ? 0 : -1}
              aria-label={`Rename group ${node.name}`}
              title={`Rename ${node.name}`}
              onClick={(event) => {
                event.stopPropagation();
                if (groupId !== null) setEditing(true);
              }}
              className={cn(
                "hidden size-5 items-center justify-center rounded",
                "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "group-hover/group:flex group-focus-within/group:flex",
                groupId === null && "group-hover/group:hidden",
              )}
            >
              <Icon name="Edit" className="size-3.5" aria-hidden />
            </button>
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">
            {node.name}
          </span>
        </button>
      )}
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
      <RowActions>
        <GroupMenu
          name={node.name}
          groupId={groupId}
          expanded={expanded}
          revealed={reveal.revealed}
          canMoveUp={groupId !== null && groups[0]?.id !== groupId}
          canMoveDown={groupId !== null && groups[groups.length - 1]?.id !== groupId}
          onToggleExpanded={() => setExpanded((open) => !open)}
          onRename={() => setEditing(true)}
          onMove={(delta) => handlers.onGroupMove?.(groupId ?? "", delta)}
        />
      </RowActions>
    </div>
  );

  return (
    <section
      aria-label={node.name}
      data-nested-group={node.groupId ?? "__ungrouped__"}
      className="mb-1"
    >
      <InfoCard
        trigger={header}
        label={node.name}
        rows={[
          { label: "Type", value: groupId === null ? "Ungrouped" : "Group" },
          { label: "Projects", value: String(projectCount) },
          { label: "Threads", value: String(threadCount) },
          ...(groupId === null
            ? []
            : [{ label: "Group ID", value: groupId, mono: true, copy: true }]),
        ]}
      />
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
              onNewWorktree={onNewWorktree}
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

/** The in-place name editor. Commits on Enter or blur, abandons on Escape. */
function GroupNameField({
  name,
  onCommit,
  onCancel,
}: {
  name: string;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  // Blur and Enter both commit, and Escape commits nothing, so a single guard
  // keeps the two commit paths from firing together.
  const [done, setDone] = useState(false);
  const finish = (commit: boolean) => {
    if (done) return;
    setDone(true);
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      aria-label={`Rename group ${name}`}
      onChange={(event) => setValue(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className={cn(
        "h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    />
  );
}

/**
 * Everything that can be done to a group, in one place.
 *
 * The inline pencil is the fast path for the common move (rename); this menu
 * holds the rest. Ungrouped is not a stored group, so its menu offers only what
 * applies to a bucket that cannot be renamed, moved, or deleted.
 */
function GroupMenu({
  name,
  groupId,
  expanded,
  revealed,
  canMoveUp,
  canMoveDown,
  onToggleExpanded,
  onRename,
  onMove,
}: {
  name: string;
  groupId: string | null;
  expanded: boolean;
  revealed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleExpanded: () => void;
  onRename: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <Menu
      label={`Actions for ${name}`}
      trigger={
        <RowMenuTrigger
          label={`Actions for ${name}`}
          chevron
          expanded={expanded}
          revealed={revealed}
        />
      }
    >
      <MenuItem
        icon="ChevronDown"
        label={expanded ? "Collapse" : "Expand"}
        onSelect={onToggleExpanded}
      />
      {groupId === null ? null : (
        <>
          <MenuItem icon="Edit" label="Rename…" onSelect={onRename} />
          <MenuSeparator />
          <MenuItem
            icon="ChevronUp"
            label="Move up"
            disabled={!canMoveUp}
            onSelect={() => onMove(-1)}
          />
          <MenuItem
            icon="ChevronDown"
            label="Move down"
            disabled={!canMoveDown}
            onSelect={() => onMove(1)}
          />
        </>
      )}
    </Menu>
  );
}
