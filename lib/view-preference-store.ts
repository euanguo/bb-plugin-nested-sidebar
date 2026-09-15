/**
 * How the tree is drawn, stored server-side.
 *
 * These belong with the plugin's other settings, but the frontend can only
 * *read* `bb.settings` — so a choice made from the sidebar's view menu has to
 * be written by the plugin itself. This table is that write path. Values are
 * validated on read as well as write, so a row written by an older build (or a
 * hand-edited database) degrades to the default instead of breaking the tree.
 */

import type Database from "better-sqlite3";
import {
  DEFAULT_PROJECT_SORT,
  DEFAULT_THREAD_SORT,
  validProjectSort,
  validThreadSort,
  type ProjectSortMode,
  type ThreadSortMode,
} from "./sort-modes.ts";

export const VIEW_PREFERENCE_MIGRATION = `CREATE TABLE IF NOT EXISTS view_preferences (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export interface StoredViewPreferences {
  readonly projectSort: ProjectSortMode;
  readonly threadSort: ThreadSortMode;
}

interface PreferenceRow {
  key: unknown;
  value: unknown;
}

export function createViewPreferenceStore(db: Database.Database) {
  const readAll = (): Record<string, string> => {
    const rows = db
      .prepare(`SELECT key, value FROM view_preferences`)
      .all() as PreferenceRow[];
    const values: Record<string, string> = {};
    for (const row of rows) {
      if (typeof row.key === "string" && typeof row.value === "string") {
        values[row.key] = row.value;
      }
    }
    return values;
  };

  const get = (): StoredViewPreferences => {
    const values = readAll();
    return {
      projectSort: validProjectSort(values.projectSort)
        ? values.projectSort
        : DEFAULT_PROJECT_SORT,
      threadSort: validThreadSort(values.threadSort)
        ? values.threadSort
        : DEFAULT_THREAD_SORT,
    };
  };

  const set = (patch: {
    projectSort?: ProjectSortMode;
    threadSort?: ThreadSortMode;
  }): StoredViewPreferences => {
    const statement = db.prepare(
      `INSERT INTO view_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value, updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    const run = db.transaction(() => {
      if (patch.projectSort !== undefined && validProjectSort(patch.projectSort)) {
        statement.run("projectSort", patch.projectSort, now);
      }
      if (patch.threadSort !== undefined && validThreadSort(patch.threadSort)) {
        statement.run("threadSort", patch.threadSort, now);
      }
    });
    run();
    return get();
  };

  return { get, set };
}
