// bb-plugin-nested-sidebar backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes this database with it —
// see `lib/warm-start.ts` for the browser-side copy of the same rows, which is
// the one part it does not take.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

// Prefer the platform global over `node:crypto`: bb bundles the server with a
// browser-ish resolver that does not shim built-in node modules, so a `node:`
// import is a build error. `crypto.randomUUID` is present in the bb server
// runtime and in every supported Node.
const randomUUID = (): string => crypto.randomUUID();
// Relative, not the `@/` alias the frontend uses: bb loads this file directly
// as a path source, so nothing rewrites tsconfig paths for it.
import { parseArchivedThreadIds } from "./lib/lifecycle.ts";
import { isWithinSettledWindow } from "./lib/settled-threads.ts";
import {
  createBulkDeleteCoordinator,
  MAX_BULK_DELETE_ROOTS,
  MAX_BULK_DELETE_THREADS,
  type BulkDeleteFamilySnapshot,
  type BulkDeleteThreadSnapshot,
} from "./lib/bulk-delete.ts";
import {
  CHILD_EXPANSION_OPTIONS,
  CUSTOM_COLOR_DEFAULTS,
  PALETTE_PRESET_OPTIONS,
  ROW_DETAIL_OPTIONS,
  ROW_DENSITY_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  STATUS_DISPLAY_OPTIONS,
} from "./lib/preferences.ts";
import {
  PROJECT_COLOR_MIGRATION,
  createProjectColorStore,
} from "./lib/project-color-store.ts";
import {
  GROUP_ASSIGNMENT_MIGRATION,
  GROUP_MIGRATION,
  createGroupStore,
} from "./lib/group-store.ts";
import { GROUP_ICON_OPTIONS, MAX_GROUPS, MAX_GROUP_NAME_LENGTH } from "./lib/groups.ts";
import {
  MAX_PROJECT_COLOR_ROWS,
  MAX_PROJECT_ID_LENGTH,
} from "./lib/project-colors.ts";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
  // bb's archive cascades to child threads and reports every id it took.
  // Without them, un-settling gives the parent back and leaves its children
  // archived for good.
  `ALTER TABLE thread_lifecycle ADD COLUMN archived_thread_ids TEXT`,
  PROJECT_COLOR_MIGRATION,
  GROUP_MIGRATION,
  GROUP_ASSIGNMENT_MIGRATION,
  `ALTER TABLE project_groups ADD COLUMN icon TEXT NOT NULL DEFAULT 'Layer'`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
  /** Every id the settle's archive took, this thread's own included. */
  archivedThreadIds: string[];
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
  archived_thread_ids: string | null;
}

interface AuthoritativeThreadRow {
  id: string;
  projectId: string;
  title: string | null;
  titleFallback: string | null;
  parentThreadId: string | null;
  status: "active" | "error" | "idle" | "pending" | "starting" | "stopping";
  hasPendingInteraction: boolean;
  pinnedAt: number | null;
  lastReadAt: number | null;
  latestAttentionAt: number;
  deletedAt: number | null;
  activity: {
    activeWorkflowCount: number;
    activeBackgroundAgentCount: number;
    activeBackgroundCommandCount: number;
    activePlanModeCount: number;
    activeGoalCount: number;
  };
  runtime: {
      displayStatus:
        | "active"
        | "error"
        | "host-reconnecting"
        | "idle"
        | "pending"
        | "provisioning"
        | "starting"
        | "stopping"
        | "waiting-for-host";
  };
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const projectIdSchema = z
  .string()
  .min(1)
  .max(MAX_PROJECT_ID_LENGTH)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value), {
    message: "Project id contains control characters.",
  });
const projectColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-F]{6}$/i)
  .transform((value) => value.toUpperCase());
const storedProjectColorSchema = z.object({
  projectId: projectIdSchema,
  color: projectColorSchema,
});
const bulkDeleteSkipReasonSchema = z.enum([
  "missing",
  "current",
  "working",
  "waiting",
  "unread",
  "pinned",
  "overlap",
  "scope-changed",
]);
const bulkDeleteSkippedRootSchema = z.object({
  id: z.string(),
  reason: bulkDeleteSkipReasonSchema,
  message: z.string(),
});
const selectedThreadIdsSchema = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(MAX_BULK_DELETE_ROOTS)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "A root thread can be selected only once.",
  });
export const nestRpcContract = defineRpcContract({
  listProjectColors: {
    input: z.object({}),
    output: z.object({
      colors: z.array(storedProjectColorSchema).max(MAX_PROJECT_COLOR_ROWS),
    }),
  },
  setProjectColor: {
    input: z.object({ projectId: projectIdSchema, color: projectColorSchema }),
    output: storedProjectColorSchema,
  },
  resetProjectColor: {
    input: z.object({ projectId: projectIdSchema }),
    output: z.object({ projectId: projectIdSchema, reset: z.boolean() }),
  },
  // Project groups: the level above projects. Everything on a group row
  // (counts, worst status) is derived from its threads at render time, so the
  // wire carries only identity, name, order, and membership.
  listGroups: {
    input: z.object({}),
    output: z.object({
      groups: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          position: z.number(),
          icon: z.enum(GROUP_ICON_OPTIONS),
        }),
      ),
      assignment: z.record(z.string(), z.string()),
    }),
  },
  createGroup: {
    input: z.object({
      name: z.string().trim().min(1).max(MAX_GROUP_NAME_LENGTH),
      icon: z.enum(GROUP_ICON_OPTIONS).default("Layer"),
    }),
    output: z.object({
      id: z.string(),
      name: z.string(),
      position: z.number(),
      icon: z.enum(GROUP_ICON_OPTIONS),
    }),
  },
  renameGroup: {
    input: z.object({
      groupId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(MAX_GROUP_NAME_LENGTH),
      icon: z.enum(GROUP_ICON_OPTIONS).optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  deleteGroup: {
    input: z.object({ groupId: z.string().trim().min(1) }),
    output: z.object({ ok: z.boolean() }),
  },
  assignProjectToGroup: {
    input: z.object({
      projectId: projectIdSchema,
      groupId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  reorderGroups: {
    input: z.object({
      groupIds: z.array(z.string().trim().min(1)).max(MAX_GROUPS),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /**
   * Rename a project. Thin on purpose: the name is bb's own field, and the
   * sidebar's project row is a second way into it rather than a parallel
   * store. bb validates the value, so nothing is re-checked here beyond the
   * empty case it would reject anyway.
   */
  renameProject: {
    input: z.object({
      projectId: projectIdSchema,
      name: z.string().trim().min(1),
    }),
    output: z.object({ name: z.string() }),
  },
  /**
   * Rename a worktree — its environment's display name, which is the alias the
   * sidebar shows beside the branch.
   *
   * bb owns this field, so this is a forward rather than a second store: the
   * worktree then reads the same way everywhere, and a branch change can never
   * disagree with a name only this plugin knew about.
   */
  renameEnvironment: {
    input: z.object({
      environmentId: z.string().trim().min(1),
      name: z.string().trim().min(1).max(120),
    }),
    output: z.object({ name: z.string().nullable() }),
  },
  /**
   * Remove a project and its threads.
   *
   * Destructive and recursive, so the confirmation lives in the UI and the
   * request carries the project's current name: a rename between the dialog
   * opening and the click must fail rather than delete something the user did
   * not name. The plugin never removes a project the user has not typed for.
   */
  removeProject: {
    input: z.object({
      projectId: projectIdSchema,
      expectedName: z.string().trim().min(1),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /**
   * Create a thread from the new-thread dialog.
   *
   * The request body is forwarded to `threads.spawn` as-is rather than
   * re-declared here: it is bb's own composer output, and re-typing that schema
   * would silently drop any field the host adds later. Only the two facts this
   * plugin actually depends on are asserted — a project is named, and the
   * origin says it came from a plugin.
   */
  spawnThread: {
    input: z.object({ request: z.record(z.string(), z.unknown()) }),
    output: z.object({ threadId: z.string().nullable() }),
  },
  listProviders: {
    input: z.object({}),
    output: z.object({
      providers: z.array(
        z.object({
          id: z.string(),
          displayName: z.string(),
          logoUrl: z.string().nullable(),
        }),
      ),
    }),
  },
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
        }),
      ),
    }),
  },
  // The settled shelf's own rows. bb's sidebar view is built from queries
  // pinned to `archived: false`, so a settled — and therefore archived —
  // thread never reaches the frontend through the host. It comes through here
  // instead, and only for the last day: see `SETTLED_WINDOW_MS`. Fields are
  // deliberately loose (`status`, `originKind` as plain strings) so a new bb
  // value degrades in the mapper rather than failing output validation and
  // blanking the shelf.
  listSettledThreads: {
    input: z.object({}),
    output: z.object({
      threads: z.array(
        z.object({
          id: z.string(),
          settledAt: z.number(),
          projectId: z.string(),
          title: z.string().nullable(),
          titleFallback: z.string().nullable(),
          parentThreadId: z.string().nullable(),
          sectionId: z.string().nullable(),
          originKind: z.string().nullable(),
          originPluginId: z.string().nullable(),
          providerId: z.string(),
          status: z.string(),
          hasPendingInteraction: z.boolean(),
          isPinned: z.boolean(),
          activity: z.object({
            workflows: z.number(),
            backgroundAgents: z.number(),
            backgroundCommands: z.number(),
            planMode: z.number(),
            goals: z.number(),
          }),
          createdAt: z.number(),
          updatedAt: z.number(),
          lastReadAt: z.number().nullable(),
          latestAttentionAt: z.number(),
        }),
      ),
    }),
  },
  previewBulkDelete: {
    input: z.object({
      threadIds: selectedThreadIdsSchema,
      protectedThreadId: z.string().trim().min(1).nullable(),
    }),
    output: z.object({
      token: z.string().nullable(),
      expiresAt: z.number().int().positive().nullable(),
      included: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          childCount: z.number().int().nonnegative(),
        }),
      ),
      skipped: z.array(bulkDeleteSkippedRootSchema),
      rootCount: z.number().int().nonnegative(),
      childCount: z.number().int().nonnegative(),
      totalThreadCount: z.number().int().nonnegative(),
    }),
  },
  confirmBulkDelete: {
    input: z.object({ token: z.string().trim().min(1).max(200) }),
    output: z.object({
      deleted: z.array(z.string()),
      skipped: z.array(bulkDeleteSkippedRootSchema),
      failed: z.array(
        z.object({ id: z.string(), message: z.string().max(240) }),
      ),
    }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";
export const PROJECT_COLOR_CHANNEL = "project-colors";
export const GROUP_CHANNEL = "groups";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    palettePreset: {
      type: "select",
      label: "Palette preset",
      description:
        "Default resets the active palette. Custom uses the hex fields below.",
      options: [...PALETTE_PRESET_OPTIONS],
      default: "Default",
    },
    workingColor: colorSetting("Custom · Working", CUSTOM_COLOR_DEFAULTS.working),
    workflowColor: colorSetting(
      "Custom · Workflow",
      CUSTOM_COLOR_DEFAULTS.workflow,
    ),
    agentColor: colorSetting("Custom · Agent", CUSTOM_COLOR_DEFAULTS.agent),
    commandColor: colorSetting(
      "Custom · Command",
      CUSTOM_COLOR_DEFAULTS.command,
    ),
    planColor: colorSetting("Custom · Plan", CUSTOM_COLOR_DEFAULTS.plan),
    goalColor: colorSetting("Custom · Goal", CUSTOM_COLOR_DEFAULTS.goal),
    waitingColor: colorSetting(
      "Custom · Stalled / waiting",
      CUSTOM_COLOR_DEFAULTS.waiting,
    ),
    unreadColor: colorSetting(
      "Custom · Waiting to read",
      CUSTOM_COLOR_DEFAULTS.unread,
    ),
    errorColor: colorSetting("Custom · Error", CUSTOM_COLOR_DEFAULTS.error),
    idleColor: colorSetting(
      "Custom · Inactive",
      CUSTOM_COLOR_DEFAULTS.inactive,
    ),
    staleColor: colorSetting("Custom · Stale", CUSTOM_COLOR_DEFAULTS.stale),
    prReviewColor: colorSetting(
      "Custom · PR review",
      CUSTOM_COLOR_DEFAULTS.prReview,
    ),
    prChecksColor: colorSetting(
      "Custom · PR checks",
      CUSTOM_COLOR_DEFAULTS.prChecks,
    ),
    prReadyColor: colorSetting(
      "Custom · PR ready",
      CUSTOM_COLOR_DEFAULTS.prReady,
    ),
    prMergedColor: colorSetting(
      "Custom · PR merged",
      CUSTOM_COLOR_DEFAULTS.prMerged,
    ),
    prDraftColor: colorSetting(
      "Custom · PR draft",
      CUSTOM_COLOR_DEFAULTS.prDraft,
    ),
    prBlockedColor: colorSetting(
      "Custom · PR blocked",
      CUSTOM_COLOR_DEFAULTS.prBlocked,
    ),
    prClosedColor: colorSetting(
      "Custom · PR closed",
      CUSTOM_COLOR_DEFAULTS.prClosed,
    ),
    rowDensity: {
      type: "select",
      label: "Row density",
      options: [...ROW_DENSITY_OPTIONS],
      default: "Comfortable",
    },
    rowLayout: {
      type: "select",
      label: "Thread row layout",
      description:
        "One line puts the branch beside the title and halves the row height.",
      options: [...ROW_LAYOUT_OPTIONS],
      default: "Two lines",
    },
    rowDetails: {
      type: "select",
      label: "Thread details",
      description:
        "On hover moves branch, provider, PR, age, and child count into the row's hover card.",
      options: [...ROW_DETAIL_OPTIONS],
      default: "In the row",
    },
    statusDisplay: {
      type: "select",
      label: "Thread status marker",
      description:
        "A dot is quieter and narrower; the status icon keeps a distinct shape per state.",
      options: [...STATUS_DISPLAY_OPTIONS],
      default: "Dot",
    },
    defaultChildExpansion: {
      type: "select",
      label: "Default child expansion",
      description: "Search still reveals matching child threads.",
      options: [...CHILD_EXPANSION_OPTIONS],
      default: "Expanded",
    },
    showProviderIcons: {
      type: "boolean",
      label: "Show provider icons",
      default: true,
    },
    showPullRequestMetadata: {
      type: "boolean",
      label: "Show parent PR metadata",
      default: true,
    },
    showRelativeTime: {
      type: "boolean",
      label: "Show relative time",
      default: true,
    },
    showChildCount: {
      type: "boolean",
      label: "Show child thread count",
      description: "The disclosure beside a thread that has agents.",
      default: true,
    },
    showThreadLocation: {
      type: "boolean",
      label: "Show thread branch or host",
      default: true,
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  const projectColors = createProjectColorStore(db);
  const groups = createGroupStore(db);

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(
          `SELECT thread_id, settled_at, snoozed_until, snoozed_at,
                  archived_thread_ids
             FROM thread_lifecycle`,
        )
        .all() as LifecycleDbRow[]
    ).map((row) => ({
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
      archivedThreadIds: parseArchivedThreadIds(row.archived_thread_ids),
    }));

  const readOne = (threadId: string): StoredLifecycleRow | undefined => {
    const row = db
      .prepare(
        `SELECT thread_id, settled_at, snoozed_until, snoozed_at,
                archived_thread_ids
           FROM thread_lifecycle
          WHERE thread_id = ?`,
      )
      .get(threadId) as LifecycleDbRow | undefined;
    if (row === undefined) return undefined;
    return {
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
      archivedThreadIds: parseArchivedThreadIds(row.archived_thread_ids),
    };
  };

  const write = (row: StoredLifecycleRow): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at, archived_thread_ids)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at,
         archived_thread_ids = excluded.archived_thread_ids`,
    ).run(
      row.threadId,
      row.settledAt,
      row.snoozedUntil,
      row.snoozedAt,
      row.archivedThreadIds.length === 0
        ? null
        : JSON.stringify(row.archivedThreadIds),
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
  };

  const clear = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(
      threadId,
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  /**
   * bb's own archive, kept in step with the settled shelf.
   *
   * "Settled" and "archived" are the same statement — this work is done — so
   * saying it in one place and not the other leaves the built-in sidebar, the
   * archived filter, and worktree reuse disagreeing with the shelf.
   *
   * Returns every id bb took, which for a thread with children is more than
   * the one asked for. An empty array means the archive did not happen.
   */
  const archiveThread = async (threadId: string): Promise<string[]> => {
    try {
      const result = await bb.sdk.threads.archive({ threadId });
      const ids = result.archivedThreadIds ?? [];
      return ids.includes(threadId) ? ids : [...ids, threadId];
    } catch (error) {
      // Archiving reaches the thread's host, which can be offline. The flag is
      // read — `visibleInboxThreads` drops an archived thread — but the row
      // outranks it, so a failure here costs the archive and nothing else: the
      // flag stays false, the row still shelves the thread, and it sits where
      // the user put it.
      bb.log.warn(`archive failed for thread ${threadId}: ${String(error)}`);
      return [];
    }
  };

  /** The mirror: every id the settle took, given back one by one. */
  const unarchiveThreads = async (threadIds: readonly string[]) => {
    for (const threadId of threadIds) {
      try {
        await bb.sdk.threads.unarchive({ threadId });
      } catch (error) {
        // One child that cannot be reached must not strand the rest, and the
        // parent is the id that matters most — it is the one on the shelf.
        // This direction is not the benign one `archiveThread` describes: the
        // callers clear or rewrite the row whatever happens here, so a parent
        // that stays archived is a thread nothing here still calls settled,
        // and it leaves the sidebar until bb unarchives it.
        bb.log.warn(`unarchive failed for thread ${threadId}: ${String(error)}`);
      }
    }
  };

  /**
   * Every id a settle archived, or the thread's own id when the row predates
   * the cascade column. The fallback is exactly the old behaviour.
   */
  const archivedIdsFor = (threadId: string): string[] => {
    const stored = readOne(threadId)?.archivedThreadIds ?? [];
    return stored.length === 0 ? [threadId] : stored;
  };

  /** One page is already generous; the loop is for the account that isn't. */
  const ARCHIVED_PAGE_SIZE = 200;
  const ARCHIVED_PAGE_LIMIT = 50;

  const listArchivedThreads = async () => {
    const collected = [];
    for (let page = 0; page < ARCHIVED_PAGE_LIMIT; page++) {
      const rows = await bb.sdk.threads.list({
        archived: true,
        limit: ARCHIVED_PAGE_SIZE,
        offset: page * ARCHIVED_PAGE_SIZE,
      });
      collected.push(...rows);
      if (rows.length < ARCHIVED_PAGE_SIZE) break;
    }
    return collected;
  };

  const BULK_PAGE_SIZE = 200;
  const BULK_PAGE_LIMIT = 25;

  const listThreadRows = async (filters: {
    archived: boolean;
    projectId?: string;
    parentThreadId?: string;
  }): Promise<AuthoritativeThreadRow[]> => {
    const collected: AuthoritativeThreadRow[] = [];
    for (let page = 0; page < BULK_PAGE_LIMIT; page++) {
      const rows = await bb.sdk.threads.list({
        ...filters,
        includeHidden: true,
        limit: BULK_PAGE_SIZE,
        offset: page * BULK_PAGE_SIZE,
      });
      collected.push(...rows);
      if (rows.length < BULK_PAGE_SIZE) return collected;
    }
    throw new RangeError("Thread list is too large to validate safely.");
  };

  const listBothArchiveStates = async (filters: {
    projectId?: string;
    parentThreadId?: string;
  }): Promise<AuthoritativeThreadRow[]> => {
    const [active, archived] = await Promise.all([
      listThreadRows({ ...filters, archived: false }),
      listThreadRows({ ...filters, archived: true }),
    ]);
    const byId = new Map<string, AuthoritativeThreadRow>();
    for (const thread of [...active, ...archived]) byId.set(thread.id, thread);
    return [...byId.values()];
  };

  const toBulkSnapshot = (
    thread: AuthoritativeThreadRow,
  ): BulkDeleteThreadSnapshot => ({
    id: thread.id,
    title:
      thread.title?.trim() ||
      thread.titleFallback?.trim() ||
      "Untitled thread",
    parentThreadId: thread.parentThreadId,
    status: thread.runtime.displayStatus,
    hasPendingInteraction: thread.hasPendingInteraction,
    isPinned: thread.pinnedAt !== null,
    isUnread: thread.latestAttentionAt > (thread.lastReadAt ?? 0),
    activity: {
      workflows: thread.activity.activeWorkflowCount,
      backgroundAgents: thread.activity.activeBackgroundAgentCount,
      backgroundCommands: thread.activity.activeBackgroundCommandCount,
      planMode: thread.activity.activePlanModeCount,
      goals: thread.activity.activeGoalCount,
    },
  });

  const readBulkFamily = async (
    rootId: string,
  ): Promise<BulkDeleteFamilySnapshot | null> => {
    let detail;
    try {
      detail = await bb.sdk.threads.get({ threadId: rootId });
    } catch {
      return null;
    }
    if (detail.deletedAt !== null) return null;

    const projectRows = await listBothArchiveStates({
      projectId: detail.projectId,
    });
    const root = projectRows.find((thread) => thread.id === rootId);
    if (root === undefined || root.deletedAt !== null) return null;

    const descendants: AuthoritativeThreadRow[] = [];
    const visited = new Set([rootId]);
    const parents = [rootId];
    while (parents.length > 0) {
      const parentThreadId = parents.shift();
      if (parentThreadId === undefined) break;
      const children = await listBothArchiveStates({ parentThreadId });
      for (const child of children) {
        if (child.deletedAt !== null || visited.has(child.id)) continue;
        visited.add(child.id);
        descendants.push(child);
        parents.push(child.id);
        if (descendants.length > MAX_BULK_DELETE_THREADS) {
          throw new RangeError(
            `A selected family exceeds ${MAX_BULK_DELETE_THREADS} threads.`,
          );
        }
      }
    }

    // childSummary is the deletion service's own count. If our paged walk
    // found fewer rows, fail closed instead of presenting a smaller cascade.
    const summary = await bb.sdk.threads.childSummary({ threadId: rootId });
    if (summary.nonDeletedChildCount > descendants.length) {
      throw new Error("Could not enumerate every child thread safely.");
    }

    return {
      root: toBulkSnapshot(root),
      descendants: descendants.map(toBulkSnapshot),
    };
  };

  const bulkDelete = createBulkDeleteCoordinator({
    readFamily: readBulkFamily,
    async deleteRoot(threadId, childThreadsConfirmed) {
      await bb.sdk.threads.delete({ threadId, childThreadsConfirmed });
    },
    now: () => Date.now(),
    createToken: () => randomUUID(),
    reportFailure(threadId, error) {
      bb.log.warn(`bulk delete failed for thread ${threadId}: ${String(error)}`);
    },
  });

  bb.rpc.register(nestRpcContract, {
    async listProjectColors() {
      return { colors: projectColors.list() };
    },
    async setProjectColor({ projectId, color }) {
      await bb.sdk.projects.get({ projectId });
      const stored = projectColors.set(projectId, color);
      bb.realtime.publish(PROJECT_COLOR_CHANNEL, { projectId });
      return stored;
    },
    async resetProjectColor({ projectId }) {
      await bb.sdk.projects.get({ projectId });
      const reset = projectColors.reset(projectId);
      bb.realtime.publish(PROJECT_COLOR_CHANNEL, { projectId });
      return { projectId, reset };
    },
    async listGroups() {
      return { groups: groups.list(), assignment: groups.assignments() };
    },
    async createGroup({ name, icon }) {
      const created = groups.create(`grp_${randomUUID()}`, name, icon);
      bb.realtime.publish(GROUP_CHANNEL, {});
      return created;
    },
    async renameGroup({ groupId, name, icon }) {
      // Renaming an id that is gone is not an error worth surfacing: the tree
      // the user was looking at is stale, and the publish below refreshes it.
      const ok = groups.rename(groupId, name, icon) !== null;
      if (ok) bb.realtime.publish(GROUP_CHANNEL, {});
      return { ok };
    },
    async deleteGroup({ groupId }) {
      const ok = groups.remove(groupId);
      if (ok) bb.realtime.publish(GROUP_CHANNEL, {});
      return { ok };
    },
    async assignProjectToGroup({ projectId, groupId }) {
      // Confirm the project exists before recording a membership for it, so a
      // deleted project cannot leave a member row pointing at nothing.
      await bb.sdk.projects.get({ projectId });
      const ok = groups.assign(projectId, groupId);
      if (ok) bb.realtime.publish(GROUP_CHANNEL, {});
      return { ok };
    },
    async reorderGroups({ groupIds }) {
      // Only ids that already exist are honoured; the store rewrites positions
      // from the array index, so unknown ids must not shift real ones.
      const known = new Set(groups.list().map((group) => group.id));
      if (!groupIds.every((id) => known.has(id))) return { ok: false };
      const ok = groups.reorder(groupIds);
      if (ok) bb.realtime.publish(GROUP_CHANNEL, {});
      return { ok };
    },
    async renameProject({ projectId, name }) {
      const project = await bb.sdk.projects.update({ projectId, name });
      return { name: project.name };
    },
    async renameEnvironment({ environmentId, name }) {
      // Routed through the environment area, which is where bb keeps a
      // worktree's display name. The publish is what makes every sidebar row
      // for that worktree pick the new name up.
      const environment = await bb.sdk.environments.update({
        environmentId,
        name,
      });
      bb.realtime.publish(GROUP_CHANNEL, {});
      return { name: environment.name };
    },
    async removeProject({ projectId, expectedName }) {
      // Re-read before deleting: the dialog confirmed against a name, and a
      // project renamed in the meantime is not the one the user agreed to.
      const project = await bb.sdk.projects.get({ projectId });
      if (project.name !== expectedName) return { ok: false };
      await bb.sdk.projects.delete({ projectId });
      // A deleted project must not leave a member row pointing at nothing.
      groups.assign(projectId, null);
      bb.realtime.publish(GROUP_CHANNEL, {});
      return { ok: true };
    },
    async spawnThread({ request }) {
      const projectId = request.projectId;
      if (typeof projectId !== "string" || projectId.trim().length === 0) {
        throw new Error("A project is required to create a thread.");
      }
      const spawned = await bb.sdk.threads.spawn({
        ...(request as unknown as Parameters<typeof bb.sdk.threads.spawn>[0]),
        origin: "plugin",
        originPluginId: "nested-sidebar",
      });
      return { threadId: spawned.id ?? null };
    },
    // A custom ACP provider already carries its own brand mark, so the sidebar
    // reads it from the host rather than hard-coding a second glyph per agent.
    async listProviders() {
      const providers = await bb.sdk.providers.list();
      return {
        providers: providers.map(({ id, displayName, logoUrl }) => ({
          id,
          displayName,
          logoUrl,
        })),
      };
    },
    async listLifecycle() {
      return { rows: readAll() };
    },
    /**
     * The archived threads this plugin settled in the last day, and only
     * those. A thread the user archived through bb itself has no row here and
     * stays out of the sidebar, exactly as it did before any of this existed;
     * one settled longer ago than the window keeps its row and its archive and
     * simply stops being drawn.
     *
     * The window is applied here as well as on the frontend. The frontend's is
     * the live one — it re-cuts on its own clock, so a row ages off screen
     * without a refetch — and this one keeps the response proportional to the
     * shelf instead of to the whole archive.
     */
    async listSettledThreads() {
      const now = Date.now();
      const settledAtById = new Map(
        readAll()
          .filter(
            (row) =>
              row.settledAt !== null &&
              isWithinSettledWindow(row.settledAt, now),
          )
          .map((row) => [row.threadId, row.settledAt as number]),
      );
      if (settledAtById.size === 0) return { threads: [] };
      let archived;
      try {
        archived = await listArchivedThreads();
      } catch (error) {
        // The shelf keeps whatever the frontend already had rather than
        // emptying itself over one failed read.
        bb.log.warn(`listing archived threads failed: ${String(error)}`);
        throw error;
      }
      return {
        threads: archived
          .filter((thread) => settledAtById.has(thread.id))
          .map((thread) => ({
            id: thread.id,
            // Non-null by construction: the id came from this map.
            settledAt: settledAtById.get(thread.id) ?? 0,
            projectId: thread.projectId,
            title: thread.title,
            titleFallback: thread.titleFallback,
            parentThreadId: thread.parentThreadId,
            sectionId: thread.sectionId,
            originKind: thread.originKind,
            originPluginId: thread.originPluginId,
            providerId: thread.providerId,
            status: thread.status,
            hasPendingInteraction: thread.hasPendingInteraction,
            isPinned: thread.pinnedAt !== null,
            activity: {
              workflows: thread.activity.activeWorkflowCount,
              backgroundAgents: thread.activity.activeBackgroundAgentCount,
              backgroundCommands: thread.activity.activeBackgroundCommandCount,
              planMode: thread.activity.activePlanModeCount,
              goals: thread.activity.activeGoalCount,
            },
            createdAt: thread.createdAt,
            updatedAt: thread.updatedAt,
            lastReadAt: thread.lastReadAt,
            latestAttentionAt: thread.latestAttentionAt,
          })),
      };
    },
    async previewBulkDelete({ threadIds, protectedThreadId }) {
      return bulkDelete.preview(threadIds, protectedThreadId);
    },
    async confirmBulkDelete({ token }) {
      return bulkDelete.confirm(token);
    },
    async settle({ threadId }) {
      // Settling clears any snooze: they are two answers to the same
      // question, and holding both would make the shelf order ambiguous.
      write({
        threadId,
        settledAt: Date.now(),
        snoozedUntil: null,
        snoozedAt: null,
        archivedThreadIds: [],
      });
      // The row first, then the archive. A settled thread stays on screen
      // only because its row says so, so archiving first would blink it out
      // of the list until the row landed.
      const archivedThreadIds = await archiveThread(threadId);
      if (archivedThreadIds.length > 0) {
        // Second write, second publish — and the publish is the point. bb has
        // just evicted the thread from the host's sidebar view, so this is
        // what tells the frontend to fetch it back from `listSettledThreads`.
        // Re-read rather than re-derive: a user who restored the thread while
        // the archive was in flight must not have their un-settle overwritten
        // by the settle that started before it.
        const row = readOne(threadId);
        if (row !== undefined && row.settledAt !== null) {
          write({ ...row, archivedThreadIds });
        }
      }
      return { ok: true };
    },
    async unsettle({ threadId }) {
      // The archive first, then the row — the mirror of settle, for the same
      // reason: clearing the row while the thread is still archived would
      // drop it out of the sidebar entirely.
      await unarchiveThreads(archivedIdsFor(threadId));
      clear(threadId);
      return { ok: true };
    },
    async snooze({ threadId, snoozedUntil }) {
      const now = Date.now();
      // Snoozing a settled thread takes the archive back first: a snoozed row
      // is not on the settled shelf, so the thread has nowhere to be drawn
      // until bb reports it again.
      await unarchiveThreads(archivedIdsFor(threadId));
      write({
        threadId,
        settledAt: null,
        snoozedUntil,
        snoozedAt: now,
        archivedThreadIds: [],
      });
      return { ok: true };
    },
    async unsnooze({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id);
  });

  /**
   * The settled shelf's heartbeat.
   *
   * An archived thread is invisible to the host's sidebar view, so no host
   * update can tell the frontend that a settled thread started working or
   * finished a turn. Without this the un-settle rule — new attention brings a
   * thread back — would never fire again for anything on the shelf. A publish
   * only asks the frontend to re-read; the decision stays where it was.
   */
  const republishIfSettled = ({ thread }: { thread: { id: string } }) => {
    if (readOne(thread.id)?.settledAt == null) return;
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: thread.id });
  };
  bb.events.on("thread.active", republishIfSettled);
  bb.events.on("thread.idle", republishIfSettled);
  bb.events.on("thread.failed", republishIfSettled);
}

function colorSetting(label: string, defaultColor: string) {
  return {
    type: "string" as const,
    label,
    description: "Six-digit hex color (#RRGGBB); used only by Custom palette.",
    default: defaultColor,
  };
}
