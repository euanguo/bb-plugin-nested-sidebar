import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  sortByCreatedAtDescending,
  visibleRootOf,
  type ThreadFamily,
} from "./inbox.ts";
import { rollupThreads, mergeRollups, type StatusRollup } from "./rollup.ts";
import {
  shouldShowWorkspaces,
  workspaceRefOf,
  workspaceSortOrder,
  type WorkspaceRef,
} from "./workspace.ts";
import type { GroupIconName } from "./groups.ts";

/** One workspace inside a project — a worktree, the checkout, or nothing. */
export interface WorkspaceNode {
  readonly ref: WorkspaceRef;
  readonly families: ThreadFamily[];
  readonly rollup: StatusRollup;
}

export interface ProjectNode {
  readonly project: PluginSidebarProject;
  readonly families: ThreadFamily[];
  readonly workspaces: WorkspaceNode[];
  /** False when the project's threads occupy a single workspace. */
  readonly showWorkspaces: boolean;
  readonly rollup: StatusRollup;
}

export interface GroupNode {
  /** Null for the implicit Ungrouped bucket. */
  readonly groupId: string | null;
  readonly name: string;
  readonly icon: GroupIconName;
  readonly projects: ProjectNode[];
  readonly rollup: StatusRollup;
}

/**
 * Build the whole tree in one pass.
 *
 * The workspace level is computed per project and omitted when it would not
 * distinguish anything (`showWorkspaces === false`), which is what keeps the
 * common single-checkout project flat. Rollups are folded bottom-up, so every
 * level reports the same truth about what is running underneath it.
 */
export function buildTree(input: {
  /**
   * Projects already resolved into families and ordered by the caller. Taking
   * them this way means every existing rule — lifecycle shelves, filtering,
   * manual project and family order — keeps working untouched, and this module
   * only adds the workspace and group levels on top.
   */
  projectGroups: readonly { project: PluginSidebarProject; families: ThreadFamily[] }[];
  now: number;
  /** projectId -> groupId, already validated against existing groups. */
  assignment: Readonly<Record<string, string>>;
  /** Rendered in this order; an id with no projects is dropped. */
  groupOrder: readonly { id: string; name: string; icon: GroupIconName }[];
}): GroupNode[] {
  const { projectGroups, now, assignment, groupOrder } = input;

  const projectsByGroup = new Map<string, ProjectNode[]>();
  for (const group of projectGroups) {
    const node = buildProjectNode(group.project, group.families, now);
    const groupId = assignment[group.project.id] ?? "__ungrouped__";
    const bucket = projectsByGroup.get(groupId) ?? [];
    bucket.push(node);
    projectsByGroup.set(groupId, bucket);
  }

  const byName = (left: ProjectNode, right: ProjectNode) =>
    left.project.name.localeCompare(right.project.name);

  const nodes: GroupNode[] = [];
  for (const group of groupOrder) {
    const bucket = projectsByGroup.get(group.id);
    if (bucket === undefined || bucket.length === 0) continue;
    nodes.push(
      makeGroupNode(group.id, group.name, group.icon, [...bucket].sort(byName)),
    );
  }

  const ungrouped = projectsByGroup.get("__ungrouped__");
  if (ungrouped !== undefined && ungrouped.length > 0) {
    nodes.push(
      makeGroupNode(null, "Ungrouped", "FolderTree", [...ungrouped].sort(byName)),
    );
  }

  // A project whose group id no longer exists in groupOrder would otherwise
  // vanish. Park it in Ungrouped rather than losing it from the sidebar.
  const known = new Set(groupOrder.map((group) => group.id));
  const orphans = [...projectsByGroup.entries()]
    .filter(([groupId]) =>
      groupId !== "__ungrouped__" && !known.has(groupId),
    )
    .flatMap(([, bucket]) => bucket);
  if (orphans.length > 0) {
    const existing = nodes.find((node) => node.groupId === null);
    const combined = [...(existing?.projects ?? []), ...orphans].sort(byName);
    const replacement = makeGroupNode(null, "Ungrouped", "FolderTree", combined);
    if (existing === undefined) nodes.push(replacement);
    else nodes[nodes.indexOf(existing)] = replacement;
  }

  return nodes;
}

function makeGroupNode(
  groupId: string | null,
  name: string,
  icon: GroupIconName,
  projects: ProjectNode[],
): GroupNode {
  return {
    groupId,
    name,
    icon,
    projects,
    rollup: mergeRollups(projects.map((project) => project.rollup)),
  };
}

function buildProjectNode(
  project: PluginSidebarProject,
  families: readonly ThreadFamily[],
  now: number,
): ProjectNode {
  const allThreads = families.flatMap((family) => [
    family.root,
    ...family.children,
  ]);

  // Group families by the workspace of their ROOT: a child agent runs where
  // its parent does, and splitting a family across nodes would break it apart.
  const workspacesById = new Map<string, { ref: WorkspaceRef; families: ThreadFamily[] }>();
  for (const family of families) {
    const ref = workspaceRefOf(family.root);
    const bucket = workspacesById.get(ref.key) ?? { ref, families: [] };
    bucket.families.push(family);
    workspacesById.set(ref.key, bucket);
  }

  const workspaces: WorkspaceNode[] = [...workspacesById.values()]
    .map(({ ref, families: bucket }) => ({
      ref,
      families: bucket,
      rollup: rollupThreads(
        bucket.flatMap((family) => [family.root, ...family.children]),
        now,
      ),
    }))
    .sort((left, right) => {
      const kindOrder =
        workspaceSortOrder(left.ref.kind) - workspaceSortOrder(right.ref.kind);
      if (kindOrder !== 0) return kindOrder;
      return left.ref.label.localeCompare(right.ref.label);
    });

  return {
    project,
    families: [...families],
    workspaces,
    showWorkspaces: shouldShowWorkspaces(workspaces.map((node) => node.ref)),
    rollup: rollupThreads(allThreads, now),
  };
}

/**
 * Search that keeps hierarchy. A match on a group keeps its whole subtree; a
 * match on a project keeps every workspace under it; deeper matches keep only
 * the branches that lead to them, so the tree collapses onto the hits.
 */
export function searchTree(
  nodes: readonly GroupNode[],
  query: string,
): GroupNode[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...nodes];
  const matches = (value: string) => value.toLowerCase().includes(normalized);

  return nodes.flatMap((node) => {
    if (matches(node.name)) return [node];
    const projects = node.projects.flatMap((project) => {
      if (matches(project.project.name)) return [project];
      const workspaces = project.workspaces.flatMap((workspace) => {
        if (matches(workspace.ref.label)) return [workspace];
        const families = workspace.families.flatMap((family) => {
          const rootMatches = matches(threadTitle(family.root));
          if (rootMatches) return [family];
          const children = family.children.filter((thread) =>
            matches(threadTitle(thread)),
          );
          return children.length > 0 ? [{ ...family, children }] : [];
        });
        return families.length > 0 ? [{ ...workspace, families }] : [];
      });
      if (workspaces.length === 0) return [];
      const families = workspaces.flatMap((workspace) => workspace.families);
      return [{ ...project, workspaces, families }];
    });
    return projects.length > 0 ? [{ ...node, projects }] : [];
  });
}

function threadTitle(thread: PluginSidebarThread): string {
  return thread.title?.trim() || thread.titleFallback?.trim() || "";
}

export { sortByCreatedAtDescending };
