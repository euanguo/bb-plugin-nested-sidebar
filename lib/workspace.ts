import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/**
 * The middle level of the sidebar tree.
 *
 * A thread always runs somewhere, but bb only exposes a branch for some
 * environments. Rather than let an unplaceable thread fall out of the tree,
 * every thread resolves to exactly one of three kinds:
 *
 * - main      — the project's own checkout (workspaceDisplayKind "other")
 * - worktree  — a managed or unmanaged worktree, labelled by its branch
 * - none      — no environment yet, or a personal workspace
 *
 * The kind is what the tree groups on; the label is only ever decoration.
 */
export type WorkspaceKind = "main" | "worktree" | "none";

export interface WorkspaceRef {
  readonly kind: WorkspaceKind;
  /** Stable within one project: an environment id, or a sentinel. */
  readonly key: string;
  readonly label: string;
  /** The thread's environment id, when it has one. Used to reuse a worktree. */
  readonly environmentId: string | null;
}

const NO_WORKSPACE: WorkspaceRef = {
  kind: "none",
  key: "__no_workspace__",
  label: "No workspace",
  environmentId: null,
};

const MAIN_CHECKOUT: WorkspaceRef = {
  kind: "main",
  key: "__main__",
  label: "main",
  environmentId: null,
};

function isWorktreeKind(kind: string | null | undefined): boolean {
  return kind === "managed-worktree" || kind === "unmanaged-worktree";
}

/**
 * Where a thread lives. A worktree without a branch name still has an
 * environment id, so it is still its own node — it just falls back to the
 * environment's own name for a label.
 */
export function workspaceRefOf(thread: PluginSidebarThread): WorkspaceRef {
  const environment = thread.environment;
  if (environment === null) return NO_WORKSPACE;
  if (!isWorktreeKind(environment.workspaceDisplayKind)) return MAIN_CHECKOUT;

  const branch = environment.branchName?.trim();
  const name = environment.name?.trim();
  const label = branch || name || "worktree";
  return {
    kind: "worktree",
    key: environment.id ?? label,
    label,
    environmentId: environment.id,
  };
}

/**
 * The workspace level is only worth drawing when it distinguishes anything.
 *
 * A project whose threads all sit in one place — the common case of a single
 * checkout — reads better flat, which is also how bb's own sidebar shows it.
 * The moment a second workspace appears, the level earns its space.
 */
export function shouldShowWorkspaces(refs: readonly WorkspaceRef[]): boolean {
  const keys = new Set(refs.map((ref) => ref.key));
  return keys.size >= 2;
}

/** Worktrees first (branch order), then main, then threads with no workspace. */
export function workspaceSortOrder(kind: WorkspaceKind): number {
  if (kind === "worktree") return 0;
  if (kind === "main") return 1;
  return 2;
}
