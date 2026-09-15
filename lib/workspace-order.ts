/**
 * The arrangement of a project's worktrees.
 *
 * The checkout never moves. It is the project itself, it is the one row that is
 * always there, and it leads under every arrangement — so only worktrees are
 * ordered here, and the list that gets stored holds only their keys.
 *
 * A key is a workspace's own key, which is its environment id. What the user is
 * arranging is a place on disk, not a branch name that two places can share.
 */

import { validOrderId, validOrderItems } from "./manual-order.ts";
import { workspaceSortOrder, type WorkspaceRef } from "./workspace.ts";

export type WorkspaceMoveResult =
  | { readonly ok: true; readonly keys: string[] }
  | {
      readonly ok: false;
      readonly reason:
        | "cross-project"
        | "invalid-id"
        | "missing-workspace"
        | "same-workspace";
    };

/**
 * Where one worktree lands when it is dropped on another.
 *
 * Both keys have to belong to the project being arranged and both have to be in
 * the list it was arranged from: a drop that names something the sidebar is not
 * drawing would otherwise write an arrangement for rows the user cannot see.
 */
export function moveProjectWorkspace({
  projectId,
  sourceProjectId,
  targetProjectId,
  keys,
  sourceKey,
  targetKey,
  position,
}: {
  projectId: string;
  sourceProjectId: string;
  targetProjectId: string;
  keys: readonly string[];
  sourceKey: string;
  targetKey: string;
  position: "before" | "after";
}): WorkspaceMoveResult {
  if (sourceProjectId !== projectId || targetProjectId !== projectId) {
    return { ok: false, reason: "cross-project" };
  }
  if (![projectId, sourceKey, targetKey].every(validOrderId)) {
    return { ok: false, reason: "invalid-id" };
  }
  if (sourceKey === targetKey) return { ok: false, reason: "same-workspace" };
  if (!validOrderItems(keys)) return { ok: false, reason: "invalid-id" };
  const sourceIndex = keys.indexOf(sourceKey);
  if (sourceIndex < 0 || !keys.includes(targetKey)) {
    return { ok: false, reason: "missing-workspace" };
  }
  const order = [...keys];
  order.splice(sourceIndex, 1);
  order.splice(
    order.indexOf(targetKey) + (position === "after" ? 1 : 0),
    0,
    sourceKey,
  );
  return { ok: true, keys: order };
}

/** One step for the keyboard, which is the same move against the next row. */
export function keyboardWorkspaceMove(
  projectId: string,
  keys: readonly string[],
  sourceKey: string,
  delta: -1 | 1,
): WorkspaceMoveResult {
  const sourceIndex = keys.indexOf(sourceKey);
  if (sourceIndex < 0) return { ok: false, reason: "missing-workspace" };
  const targetKey = keys[sourceIndex + delta];
  if (targetKey === undefined) {
    return { ok: false, reason: "missing-workspace" };
  }
  return moveProjectWorkspace({
    projectId,
    sourceProjectId: projectId,
    targetProjectId: projectId,
    keys,
    sourceKey,
    targetKey,
    position: delta < 0 ? "before" : "after",
  });
}

/**
 * A project's workspaces in the order they are drawn.
 *
 * The checkout leads because `workspaceSortOrder` says so, whatever the stored
 * arrangement says; then the worktrees the user arranged; then, for a worktree
 * the stored list does not mention — one that was just created, or created on
 * another machine — its label, which is the order everything had before any of
 * it was arranged.
 */
export function orderWorkspaces<T extends { readonly ref: WorkspaceRef }>(
  workspaces: readonly T[],
  storedKeys: readonly string[] | undefined,
): T[] {
  const stored = validOrderItems(storedKeys) ? storedKeys : [];
  const rank = new Map(stored.map((key, index) => [key, index]));
  const unlisted = stored.length;
  return [...workspaces].sort((left, right) => {
    const kindOrder =
      workspaceSortOrder(left.ref.kind) - workspaceSortOrder(right.ref.kind);
    if (kindOrder !== 0) return kindOrder;
    const leftRank = rank.get(left.ref.key) ?? unlisted;
    const rightRank = rank.get(right.ref.key) ?? unlisted;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.ref.label.localeCompare(right.ref.label);
  });
}
