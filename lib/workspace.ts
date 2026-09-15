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
 * The kind is what the tree groups on; the label is only ever decoration. A
 * checkout is not a lesser workspace than a worktree: it has a branch of its own
 * and can be named, so it carries both, and what separates the two kinds is that
 * only a worktree can be deleted from its row.
 */
export type WorkspaceKind = "main" | "worktree" | "none";

export interface WorkspaceRef {
  readonly kind: WorkspaceKind;
  /** Stable within one project: an environment id, or a sentinel. */
  readonly key: string;
  readonly label: string;
  /**
   * The user's own name for this worktree, when they set one. Drawn together
   * with the branch rather than instead of it: an alias is a label the user
   * typed, and the branch is the fact that tells them whether it was typed
   * correctly. How the two share the row is `WorkspaceLabelMode`.
   */
  readonly alias: string | null;
  /** The branch this worktree is on, if bb knows it. */
  readonly branch: string | null;
  /** The thread's environment id, when it has one. Used to reuse a worktree. */
  readonly environmentId: string | null;
}

const NO_WORKSPACE: WorkspaceRef = {
  kind: "none",
  key: "__no_workspace__",
  label: "No workspace",
  alias: null,
  branch: null,
  environmentId: null,
};

/**
 * A project's own checkout, as a row.
 *
 * Keyed by the environment rather than by a sentinel, so two checkouts attached
 * to one project stay two rows — the same way two worktrees do — and every
 * thread that shares the checkout folds into the one row. It is not a worktree,
 * and `planWorktreeRemoval` refuses to delete it, but it reads like one: the
 * alias if the user set one, then the branch it is actually standing on, and
 * only then the bare word.
 */
function checkoutRef(
  environment: NonNullable<PluginSidebarThread["environment"]>,
): WorkspaceRef {
  const branch = environment.branchName?.trim();
  const alias = environment.name?.trim();
  return {
    kind: "main",
    key: environment.id ?? "__main__",
    label: alias || branch || "main",
    alias: alias || null,
    branch: branch || null,
    environmentId: environment.id,
  };
}

function isWorktreeKind(kind: string | null | undefined): boolean {
  return kind === "managed-worktree" || kind === "unmanaged-worktree";
}

/**
 * bb's provider for the directory a thread gets when it is not working in a
 * project of its own. The app hands the provider id through untouched, so this
 * is the only thing in this DTO that tells a personal workspace apart from a
 * project checkout — both are non-worktrees, and neither is null.
 */
const PERSONAL_WORKSPACE_PROVIDER = "personal-workspace";

/**
 * Where a thread lives. A worktree without a branch name still has an
 * environment id, so it is still its own node — it just falls back to the
 * environment's own name for a label.
 *
 * A personal workspace is not a place in the project, though: its provider hands
 * every thread a directory of its own, with no branch and no name, so one row
 * per thread would print the same empty label four times over. Those threads
 * share the bucket for "none of this project's places" instead, which is what
 * keeps a project whose threads all sit in scratch directories flat — the way
 * bb's own sidebar shows it.
 */
export function workspaceRefOf(thread: PluginSidebarThread): WorkspaceRef {
  const environment = thread.environment;
  if (environment === null) return NO_WORKSPACE;
  if (!isWorktreeKind(environment.workspaceDisplayKind)) {
    return environment.providerId === PERSONAL_WORKSPACE_PROVIDER
      ? NO_WORKSPACE
      : checkoutRef(environment);
  }

  const branch = environment.branchName?.trim();
  const alias = environment.name?.trim();
  // The alias leads, because it is what the user called this worktree and what
  // they will scan for; the branch is the ground truth. Either alone still
  // labels the row, so a worktree with neither is never nameless.
  const label = alias || branch || "worktree";
  return {
    kind: "worktree",
    key: environment.id ?? label,
    label,
    alias: alias || null,
    branch: branch || null,
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

/**
 * The project's own checkout leads, then its worktrees, then threads with no
 * workspace at all.
 *
 * The checkout is where the project is: it is the row the eye should land on
 * first, and it is the one that never goes away. Worktrees come and go beneath
 * it, sorted by their own labels.
 */
export function workspaceSortOrder(kind: WorkspaceKind): number {
  if (kind === "main") return 0;
  if (kind === "worktree") return 1;
  return 2;
}

/**
 * How one workspace row divides the alias and the branch between its lines.
 *
 * The alias is a name the user typed; the branch is the fact that verifies it,
 * and the row is the only place the two meet. `alias-over-branch` is the
 * default because a single line of "alias  branch" truncates both halves as
 * soon as either is long, while stacked lines keep each one readable.
 */
export type WorkspaceLabelMode =
  | "alias-over-branch"
  | "alias-and-branch"
  | "alias-only"
  | "branch-only";

export interface WorkspaceRowLabel {
  /** The line the row is scanned by. Never empty. */
  readonly label: string;
  /** The label is a branch, so the row draws it monospaced. */
  readonly labelIsBranch: boolean;
  /** The branch, when the row draws one at all. */
  readonly detail: string | null;
  /** `true` puts the detail on its own line; `false` rides beside the label. */
  readonly stacked: boolean;
}

function alone(label: string, isBranch: boolean): WorkspaceRowLabel {
  return { label, labelIsBranch: isBranch, detail: null, stacked: false };
}

function together(
  alias: string,
  branch: string,
  stacked: boolean,
): WorkspaceRowLabel {
  return { label: alias, labelIsBranch: false, detail: branch, stacked };
}

/** Whichever half the row still has, so a row is never left with nothing. */
function remaining(ref: WorkspaceRef): WorkspaceRowLabel {
  if (ref.alias !== null) return alone(ref.alias, false);
  if (ref.branch !== null) return alone(ref.branch, true);
  return alone(ref.label, false);
}

/**
 * What one workspace row draws, given the setting and what bb knows.
 *
 * An alias equal to its branch is a single fact, so the row draws it once
 * whatever the mode says: stacking it would print the same string twice. A mode
 * that asks for a half the environment does not have falls back to the other
 * one, because a row with nothing to say would still have to draw a height.
 */
export function workspaceRowLabel(
  ref: WorkspaceRef,
  mode: WorkspaceLabelMode,
): WorkspaceRowLabel {
  const { alias, branch } = ref;
  if (alias !== null && branch !== null && alias === branch) {
    return alone(alias, false);
  }
  switch (mode) {
    case "alias-only":
      return alias === null ? remaining(ref) : alone(alias, false);
    case "branch-only":
      return branch === null ? remaining(ref) : alone(branch, true);
    case "alias-and-branch":
      return alias !== null && branch !== null
        ? together(alias, branch, false)
        : remaining(ref);
    case "alias-over-branch":
      return alias !== null && branch !== null
        ? together(alias, branch, true)
        : remaining(ref);
  }
}
