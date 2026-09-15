/**
 * The manual arrangement, in the plugin's own database.
 *
 * One row per scope: a group holds its projects, a project holds its root
 * threads, and a project also holds its worktrees. The ordering the user
 * arranged is data, not a per-browser view preference, so it lives beside the
 * groups — which also means it follows the user across machines and survives
 * clearing site data.
 */

import type Database from "better-sqlite3";
import {
  UNGROUPED_ORDER_SCOPE,
  parseItemIds,
  serializeItemIds,
  validOrderId,
  validOrderItems,
  validOrderMap,
  type ManualOrderMap,
} from "./manual-order.ts";

export const MANUAL_ORDER_MIGRATION = `CREATE TABLE IF NOT EXISTS manual_order (
  scope_kind TEXT NOT NULL,
  scope_id   TEXT NOT NULL,
  item_ids   TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope_kind, scope_id)
)`;

export type OrderScopeKind = "group" | "project" | "workspace";

interface OrderRow {
  scope_id: unknown;
  item_ids: unknown;
}

export function createOrderStore(db: Database.Database) {
  const readMap = (kind: OrderScopeKind): Record<string, string[]> => {
    const rows = db
      .prepare(`SELECT scope_id, item_ids FROM manual_order WHERE scope_kind = ?`)
      .all(kind) as OrderRow[];
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      if (!validOrderId(row.scope_id)) continue;
      const items = parseItemIds(
        typeof row.item_ids === "string" ? row.item_ids : null,
      );
      if (items === null) continue;
      map[row.scope_id] = items;
    }
    return map;
  };

  const list = (): {
    projects: Record<string, string[]>;
    families: Record<string, string[]>;
    workspaces: Record<string, string[]>;
  } => ({
    projects: readMap("group"),
    families: readMap("project"),
    workspaces: readMap("workspace"),
  });

  const write = (
    kind: OrderScopeKind,
    scopeId: string,
    itemIds: readonly string[],
  ): void => {
    db.prepare(
      `INSERT INTO manual_order (scope_kind, scope_id, item_ids, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope_kind, scope_id) DO UPDATE SET
         item_ids = excluded.item_ids, updated_at = excluded.updated_at`,
    ).run(kind, scopeId, serializeItemIds(itemIds), Date.now());
  };

  const setProjectOrder = (
    groupId: string,
    projectIds: readonly string[],
  ): boolean => {
    if (!validOrderId(groupId) || !validOrderItems(projectIds)) return false;
    write("group", groupId, projectIds);
    return true;
  };

  const setFamilyOrder = (
    projectId: string,
    rootIds: readonly string[],
  ): boolean => {
    if (!validOrderId(projectId) || !validOrderItems(rootIds)) return false;
    write("project", projectId, rootIds);
    return true;
  };

  /** The worktrees of one project, by workspace key. */
  const setWorkspaceOrder = (
    projectId: string,
    workspaceKeys: readonly string[],
  ): boolean => {
    if (!validOrderId(projectId) || !validOrderItems(workspaceKeys)) {
      return false;
    }
    write("workspace", projectId, workspaceKeys);
    return true;
  };

  const isEmpty = (): boolean => {
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM manual_order`)
      .get() as { count: number };
    return row.count === 0;
  };

  /**
   * One-time migration from the browser-local order.
   *
   * The legacy project order was a single global list; the tree wants it per
   * group, so it is split here by the membership the group store already
   * knows. Refuses to run once any row exists, so a second device cannot
   * overwrite an arrangement the user has since made on the first.
   */
  const seed = (
    input: { projectIds: readonly string[]; families: ManualOrderMap },
    assignment: Readonly<Record<string, string>>,
  ): boolean => {
    if (!isEmpty()) return false;
    const buckets: Record<string, string[]> = {};
    for (const projectId of input.projectIds) {
      if (!validOrderId(projectId)) continue;
      const groupId = assignment[projectId];
      const scope =
        typeof groupId === "string" && groupId.length > 0
          ? groupId
          : UNGROUPED_ORDER_SCOPE;
      const bucket = buckets[scope] ?? [];
      if (!bucket.includes(projectId)) bucket.push(projectId);
      buckets[scope] = bucket;
    }
    const families = validOrderMap(input.families) ? input.families : {};
    if (Object.keys(buckets).length === 0 && Object.keys(families).length === 0) {
      return false;
    }
    const run = db.transaction(() => {
      for (const [scope, projectIds] of Object.entries(buckets)) {
        if (projectIds.length > 0) write("group", scope, projectIds);
      }
      for (const [projectId, rootIds] of Object.entries(families)) {
        write("project", projectId, rootIds);
      }
    });
    run();
    return true;
  };

  /** A deleted group must not leave a scope row nothing will ever read. */
  const removeGroup = (groupId: string): void => {
    db.prepare(
      `DELETE FROM manual_order WHERE scope_kind = 'group' AND scope_id = ?`,
    ).run(groupId);
  };

  /** A deleted project takes both of its scopes with it. */
  const removeProject = (projectId: string): void => {
    db.prepare(
      `DELETE FROM manual_order
        WHERE scope_id = ? AND scope_kind IN ('project', 'workspace')`,
    ).run(projectId);
  };

  return {
    list,
    seed,
    setFamilyOrder,
    setProjectOrder,
    setWorkspaceOrder,
    removeGroup,
    removeProject,
  };
}
