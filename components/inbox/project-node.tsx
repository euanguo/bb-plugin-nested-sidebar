import { useId, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
} from "@/components/ui/menu";
import { copyWithAnnouncement } from "@/lib/clipboard";
import {
  RowActionButton,
  RowActions,
  RowMenuTrigger,
  useRowReveal,
} from "@/components/inbox/row-actions";
import { InfoCard, type InfoCardRow } from "@/components/ui/hover-card";
import { RollupJump } from "@/components/inbox/rollup-badge";
import { useNestViewState } from "@/components/inbox/view-state-context";
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
  onNewWorktree,
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
}) {
  const actions = useSidebarThreadActions();
  const viewState = useNestViewState();
  const expanded = !viewState.isProjectCollapsed(node.project.id);
  const setExpanded = (open: boolean) =>
    viewState.setProjectCollapsed(node.project.id, !open);
  const reveal = useRowReveal();
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
  const projectPath = handlers.paths.projects[node.project.id]?.sourcePath ?? null;

  const workspaceHandlers: TreeRowHandlers = {
    ...handlers,
    onNewThreadInWorkspace,
  };

  const infoRows: InfoCardRow[] = [
    { label: "Kind", value: node.project.isPersonal ? "Personal" : "Project" },
    { label: "Threads", value: String(threadCount) },
    // Only meaningful once the level is actually drawn, which is exactly when
    // it is worth mentioning.
    ...(node.showWorkspaces
      ? [{ label: "Worktrees", value: String(node.workspaces.length) }]
      : []),
    { label: "Project ID", value: node.project.id, mono: true, copy: true },
  ];

  const projectRow = (
    <div
      {...reveal.handlers}
      className="group/project relative flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 hover:bg-sidebar-accent/60"
    >
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
            setExpanded(!expanded);
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
        <RowActions>
          <RollupJump
            rollup={node.rollup}
            onJump={(threadId) => {
              actions.open(threadId);
              handlers.onNavigate();
            }}
            onFallback={() => setExpanded(!expanded)}
          />
          {/* Starting a thread is the common move, so it keeps its own button
              rather than hiding behind the menu. */}
          <RowActionButton
            label={`New thread in ${node.project.name}`}
            icon="Add"
            onClick={() =>
              onNewThreadInProject(node.project.id, node.project.name)
            }
          />
          <ProjectMenu
            projectId={node.project.id}
            projectName={node.project.name}
            projectPath={projectPath}
            groups={groups}
            currentGroupId={currentGroupId}
            expanded={expanded}
            revealed={reveal.revealed}
            onToggleExpanded={() => setExpanded(!expanded)}
            onNewThread={() =>
              onNewThreadInProject(node.project.id, node.project.name)
            }
            onNewWorktree={() =>
              onNewWorktree(node.project.id, node.project.name)
            }
            onAssignGroup={(groupId) => onAssignGroup(node.project.id, groupId)}
          />
        </RowActions>
    </div>
  );

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
      <InfoCard trigger={projectRow} label={node.project.name} rows={infoRows} />
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
  projectId,
  projectName,
  projectPath,
  groups,
  currentGroupId,
  expanded,
  revealed,
  onToggleExpanded,
  onNewThread,
  onNewWorktree,
  onAssignGroup,
}: {
  projectId: string;
  projectName: string;
  projectPath: string | null;
  groups: readonly ProjectGroup[];
  currentGroupId: string | null;
  expanded: boolean;
  revealed: boolean;
  onToggleExpanded: () => void;
  onNewThread: () => void;
  onNewWorktree: () => void;
  onAssignGroup: (groupId: string | null) => void;
}) {
  const navigate = useBbNavigate();
  const [dialog, setDialog] = useState<"rename" | "remove" | null>(null);

  return (
    <>
      <Menu
        label={`Actions for ${projectName}`}
        trigger={
          <RowMenuTrigger
            label={`Actions for ${projectName}`}
            chevron
            expanded={expanded}
            revealed={revealed}
          />
        }
      >
        <MenuItem
          icon="Add"
          label="New thread"
          onSelect={onNewThread}
        />
        <MenuItem
          icon="GitBranch"
          label="New worktree…"
          onSelect={onNewWorktree}
        />
        <MenuSeparator />
        <MenuItem
          icon="ChevronDown"
          label={expanded ? "Collapse" : "Expand"}
          onSelect={onToggleExpanded}
        />
        <MenuItem
          icon="Edit"
          label="Rename…"
          onSelect={() => setDialog("rename")}
        />
        {/* Membership is a rarer decision than acting on the project itself,
            so it lives one level down instead of crowding this list. */}
        <MenuSub icon="FolderTree" label="Move to group">
          {groups.map((group) => (
            <MenuCheckboxItem
              key={group.id}
              label={group.name}
              checked={group.id === currentGroupId}
              onSelect={() => onAssignGroup(group.id)}
            />
          ))}
          <MenuCheckboxItem
            label="Ungrouped"
            checked={currentGroupId === null}
            onSelect={() => onAssignGroup(null)}
          />
        </MenuSub>
        <MenuItem
          icon="Settings"
          label="Project settings"
          onSelect={() => navigate.toProject(projectId)}
        />
        <MenuItem
          icon="Copy"
          label="Copy path"
          disabled={projectPath === null}
          onSelect={() => {
            if (projectPath !== null) {
              void copyWithAnnouncement(projectPath, "Path");
            }
          }}
        />
        <MenuItem
          icon="IdCard"
          label="Copy project ID"
          onSelect={() => {
            void copyWithAnnouncement(projectId, "Project ID");
          }}
        />
        <MenuSeparator />
        <MenuItem
          icon="Trash"
          label="Remove project…"
          destructive
          onSelect={() => setDialog("remove")}
        />
      </Menu>

      {dialog === "rename" ? (
        <RenameProjectDialog
          projectId={projectId}
          currentName={projectName}
          onCancel={() => setDialog(null)}
          onRenamed={() => setDialog(null)}
        />
      ) : null}

      {dialog === "remove" ? (
        <RemoveProjectDialog
          projectId={projectId}
          projectName={projectName}
          onCancel={() => setDialog(null)}
          onRemoved={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}


/**
 * Renaming writes bb's own project name, so this is a thin wrapper rather than
 * a second store: whatever bb shows everywhere else is what the row shows.
 */
function RenameProjectDialog({
  projectId,
  currentName,
  onCancel,
  onRenamed,
}: {
  projectId: string;
  currentName: string;
  onCancel: () => void;
  onRenamed: () => void;
}) {
  const rpc = useRpc<typeof nestRpcContract>();
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();

  const submit = async () => {
    if (trimmed.length === 0 || trimmed === currentName) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rpc.call("renameProject", { projectId, name: trimmed });
      onRenamed();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      busy={busy}
      icon="Edit"
      title="Rename project"
      width="26rem"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || trimmed.length === 0}
            onClick={() => void submit()}
            className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          >
            {busy ? "Renaming…" : "Rename"}
          </button>
        </div>
      }
    >
      <label className="grid gap-1 text-2xs text-muted-foreground">
        Project name
        <input
          autoFocus
          value={value}
          maxLength={120}
          disabled={busy}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      {error === null ? null : (
        <p className="mt-2 text-2xs text-destructive">{error}</p>
      )}
    </Modal>
  );
}

/**
 * Removing a project deletes its threads with it, so the dialog says so and
 * makes the user name the project. The name is sent with the request and
 * re-checked server-side, so a rename in between cannot delete the wrong thing.
 */
function RemoveProjectDialog({
  projectId,
  projectName,
  onCancel,
  onRemoved,
}: {
  projectId: string;
  projectName: string;
  onCancel: () => void;
  onRemoved: () => void;
}) {
  const rpc = useRpc<typeof nestRpcContract>();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = value.trim() === projectName;

  const submit = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.call("removeProject", {
        projectId,
        expectedName: projectName,
      });
      if (!result.ok) {
        setError("This project changed. Reopen the menu and try again.");
        return;
      }
      onRemoved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      busy={busy}
      icon="Trash"
      title="Remove project?"
      width="26rem"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !confirmed}
            onClick={() => void submit()}
            className="h-7 rounded-md bg-destructive px-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          >
            {busy ? "Removing…" : "Remove project"}
          </button>
        </div>
      }
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        This removes <span className="font-medium text-foreground">{projectName}</span>{" "}
        and all of its threads. This cannot be undone.
      </p>
      <label className="mt-3 grid gap-1 text-2xs text-muted-foreground">
        Type {projectName} to confirm
        <input
          autoFocus
          value={value}
          disabled={busy}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && confirmed) {
              event.preventDefault();
              void submit();
            }
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      {error === null ? null : (
        <p className="mt-2 text-2xs text-destructive">{error}</p>
      )}
    </Modal>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "That did not work.";
}
