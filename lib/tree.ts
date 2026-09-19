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
import { disambiguateWorkspaceLabels, mergeWorkspaceRefs, shouldShowWorkspaces, workspaceRefOf, workspaceRefOfEnvironment, type WorkspaceEnvironmentDescriptor, type WorkspaceProjectDescriptor, type WorkspaceRef } from "./workspace.ts";
import { orderWorkspaces, workspaceSortFacts } from "./workspace-order.ts";
import type { WorktreeSortMode } from "./sort-modes.ts";
import type { ManualOrderMap } from "./manual-order.ts";
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
  /** Project id -> worktree keys, the arrangement the user made. */
  workspaceOrder: ManualOrderMap;
  /**
   * The lens over the worktree level. `manual` — the default — reads the
   * arrangement above; every other mode ranks the worktrees by a fact about
   * them and leaves that arrangement on disk untouched. The checkout leads
   * either way.
   */
  worktreeSort?: WorktreeSortMode;
  /** The icon the implicit Ungrouped section carries, chosen by the user. */
  ungroupedIcon: GroupIconName;
  environments?: ReadonlyMap<string, WorkspaceEnvironmentDescriptor>;
  projects?: ReadonlyMap<string, WorkspaceProjectDescriptor>;
}): GroupNode[] {
  const { projectGroups, now, assignment, groupOrder, ungroupedIcon } = input;
  const { workspaceOrder } = input;
  const worktreeSort = input.worktreeSort ?? "manual";
  const environments = input.environments ?? new Map<string, WorkspaceEnvironmentDescriptor>();
  const projects = input.projects ?? new Map<string, WorkspaceProjectDescriptor>();

  const projectsByGroup = new Map<string, ProjectNode[]>();
  for (const group of projectGroups) {
    const node = buildProjectNode(
      group.project,
      group.families,
      now,
      workspaceOrder[group.project.id],
      worktreeSort,
      environments,
      projects,
    );
    const groupId = assignment[group.project.id] ?? "__ungrouped__";
    const bucket = projectsByGroup.get(groupId) ?? [];
    bucket.push(node);
    projectsByGroup.set(groupId, bucket);
  }

  // Projects keep the order they arrived in. That order is already the user's
  // arrangement (or the chosen sort mode) computed per group before this call,
  // so re-sorting here would silently discard the sidebar's manual ordering.
  const nodes: GroupNode[] = [];
  for (const group of groupOrder) {
    const bucket = projectsByGroup.get(group.id);
    if (bucket === undefined || bucket.length === 0) continue;
    nodes.push(
      makeGroupNode(group.id, group.name, group.icon, [...bucket]),
    );
  }

  const ungrouped = projectsByGroup.get("__ungrouped__");
  if (ungrouped !== undefined && ungrouped.length > 0) {
    nodes.push(
      makeGroupNode(null, "Ungrouped", ungroupedIcon, [...ungrouped]),
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
    const combined = [...(existing?.projects ?? []), ...orphans];
    const replacement = makeGroupNode(null, "Ungrouped", ungroupedIcon, combined);
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
  storedWorkspaceKeys: readonly string[] | undefined,
  worktreeSort: WorktreeSortMode,
  environments: ReadonlyMap<string, WorkspaceEnvironmentDescriptor>,
  projects: ReadonlyMap<string, WorkspaceProjectDescriptor>,
): ProjectNode {
  const allThreads = families.flatMap((family) => [
    family.root,
    ...family.children,
  ]);

  // Group families by the workspace of their ROOT: a child agent runs where
  // its parent does, and splitting a family across nodes would break it apart.
  const familiesByKey = new Map<string, ThreadFamily[]>();
  for (const family of families) {
    const key = workspaceRefOf(family.root, environments, projects).key;
    const bucket = familiesByKey.get(key) ?? [];
    bucket.push(family);
    familiesByKey.set(key, bucket);
  }

  const refs = disambiguateWorkspaceLabels([
    ...projectWorkspaceRefs(project.id, families, environments, projects).values(),
  ]);
  const workspaces: WorkspaceNode[] = orderWorkspaces(
    refs.map((ref) => {
      const inWorkspace = familiesByKey.get(ref.key) ?? [];
      return {
        ref,
        families: inWorkspace,
        rollup: rollupThreads(
          inWorkspace.flatMap((family) => [family.root, ...family.children]),
          now,
        ),
      };
    }),
    storedWorkspaceKeys,
    // The lens is the whole of "not manual": `manual` reads the arrangement,
    // and every other mode needs the numbers the rows were just rolled up with.
    worktreeSort === "manual"
      ? undefined
      : { mode: worktreeSort, facts: workspaceSortFacts },
  );

  return {
    project,
    families: [...families],
    workspaces,
    showWorkspaces: shouldShowWorkspaces(
      workspaces.map((node) => node.ref),
      allThreads.length,
    ),
    rollup: rollupThreads(allThreads, now),
  };
}

/**
 * Every workspace a project has, keyed the way the tree groups them.
 *
 * Not only the ones its threads happen to occupy. An environment outlives the
 * conversations in it: once the last thread in a worktree is settled its family
 * leaves the tree, and a worktree that never held a thread never had one to
 * leave — yet both are still places to start work, and dropping either would
 * take the row, and with it the `+` that is the only way back in, off the
 * sidebar. Merging here keeps such a row identical to the one its threads built,
 * which matters because the key is what the tree groups by.
 *
 * Exported because the worktree arrangement has to name the same rows: an order
 * written from the occupied workspaces alone would omit the rest and then
 * refuse to move them.
 */
export function projectWorkspaceRefs(
  projectId: string,
  families: readonly ThreadFamily[],
  environments: ReadonlyMap<string, WorkspaceEnvironmentDescriptor>,
  projects: ReadonlyMap<string, WorkspaceProjectDescriptor>,
): Map<string, WorkspaceRef> {
  const refs = new Map<string, WorkspaceRef>();
  const remember = (ref: WorkspaceRef) => {
    const existing = refs.get(ref.key);
    refs.set(ref.key, existing === undefined ? ref : mergeWorkspaceRefs(existing, ref));
  };

  for (const family of families) {
    remember(workspaceRefOf(family.root, environments, projects));
  }
  for (const descriptor of environments.values()) {
    if (descriptor.projectId !== projectId) continue;
    const ref = workspaceRefOfEnvironment(descriptor, projects);
    if (ref !== null) remember(ref);
  }
  return refs;
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

/** Where one thread sits, in the keys each level's disclosure is stored under. */
export interface ThreadAncestors {
  /** Null for the implicit Ungrouped bucket. */
  readonly groupId: string | null;
  readonly projectId: string;
  readonly workspaceKey: string;
  /** The family root this thread belongs to; the thread itself at the root. */
  readonly rootId: string;
}

/**
 * The branch of the tree that leads to one thread, or null when it is not
 * drawn.
 *
 * This is what lets the sidebar put the user back where they were. bb restores
 * the route, but a route naming a thread inside a collapsed project would leave
 * the user staring at a closed row with no sign of the thread they just came
 * from. Revealing the ancestors is the difference between restoring a URL and
 * restoring a place.
 */
export function threadAncestors(
  nodes: readonly GroupNode[],
  threadId: string,
): ThreadAncestors | null {
  for (const group of nodes) {
    for (const project of group.projects) {
      for (const workspace of project.workspaces) {
        for (const family of workspace.families) {
          const holdsThread =
            family.root.id === threadId ||
            family.children.some((child) => child.id === threadId);
          if (!holdsThread) continue;
          return {
            groupId: group.groupId,
            projectId: project.project.id,
            workspaceKey: workspace.ref.key,
            rootId: family.root.id,
          };
        }
      }
    }
  }
  return null;
}

export { sortByCreatedAtDescending };
