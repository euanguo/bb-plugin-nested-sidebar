import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  familyStatus,
  type FamilyStatusKind,
  type FamilyStatusThread,
} from "./family-status.ts";

/**
 * What a collapsed row must still tell you.
 *
 * The signal that matters most when several levels are folded away is "is
 * anything under here running, and is anything waiting on me" — so those two
 * are counted separately and always available, regardless of how deep the
 * matching thread sits. `kind` keeps the single dominant state for colour and
 * icon, and inherits family-status' priority (failed > needs-you > working >
 * unread), which puts "needs you" ahead of "working" on purpose: a folded row
 * is scanned, not read, and a blocked thread is the one that must not hide.
 */
export interface StatusRollup {
  readonly kind: FamilyStatusKind;
  readonly total: number;
  readonly working: number;
  readonly needsYou: number;
  readonly unread: number;
  /** The thread the rollup's dominant state came from, for jump-to. */
  readonly leadThreadId: string | null;
}

const EMPTY: StatusRollup = {
  kind: "inactive",
  total: 0,
  working: 0,
  needsYou: 0,
  unread: 0,
  leadThreadId: null,
};

export function emptyRollup(): StatusRollup {
  return EMPTY;
}

function isWorking(thread: FamilyStatusThread): boolean {
  return (
    thread.indicator === "runtime" ||
    thread.indicator === "workflow" ||
    thread.indicator === "background-agent" ||
    thread.indicator === "background-command" ||
    thread.indicator === "plan-mode" ||
    thread.indicator === "goal" ||
    thread.indicator === "working-draft" ||
    thread.activity.workflows > 0 ||
    thread.activity.backgroundAgents > 0 ||
    thread.activity.backgroundCommands > 0 ||
    thread.activity.planMode > 0 ||
    thread.activity.goals > 0
  );
}

function needsYou(thread: FamilyStatusThread): boolean {
  return (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input" ||
    thread.indicator === "unread-error"
  );
}

function isUnread(thread: FamilyStatusThread): boolean {
  return thread.isUnread || thread.indicator === "unread-success";
}

/**
 * Fold a set of threads into one rollup. Doubles as the calculation for a
 * single thread, so a leaf row and a group header agree by construction.
 */
export function rollupThreads(
  threads: readonly PluginSidebarThread[],
  now: number,
): StatusRollup {
  if (threads.length === 0) return EMPTY;

  let working = 0;
  let needs = 0;
  let unread = 0;
  for (const thread of threads) {
    if (isWorking(thread)) working += 1;
    if (needsYou(thread)) needs += 1;
    if (isUnread(thread)) unread += 1;
  }

  const presentation = familyStatus(threads, now);
  // Prefer the thread that produced the dominant state, so clicking the badge
  // lands on the thing that needs you rather than an arbitrary sibling.
  const lead = leadThreadFor(threads, presentation.kind);

  return {
    kind: presentation.kind,
    total: threads.length,
    working,
    needsYou: needs,
    unread,
    leadThreadId: lead?.id ?? threads[0]?.id ?? null,
  };
}

function leadThreadFor(
  threads: readonly PluginSidebarThread[],
  kind: FamilyStatusKind,
): PluginSidebarThread | undefined {
  switch (kind) {
    case "failed":
      return threads.find((thread) => thread.indicator === "unread-error");
    case "needs-you":
      return threads.find(needsYou);
    case "working":
      return threads.find(isWorking);
    case "unread":
      return threads.find(isUnread);
    default:
      return threads[0];
  }
}

/**
 * The short string a folded header shows next to its status dot: only the
 * counts that are non-zero, most urgent first. Kept terse because this sits on
 * a row the user scans, and with many worktrees the row has little room.
 */
export function rollupSummary(rollup: StatusRollup): string {
  const parts: string[] = [];
  if (rollup.needsYou > 0) parts.push(String(rollup.needsYou) + " needs you");
  if (rollup.working > 0) parts.push(String(rollup.working) + " working");
  if (rollup.unread > 0) parts.push(String(rollup.unread) + " unread");
  return parts.join(" · ");
}

/** Merge child rollups into a parent one. Counts add; the worst kind wins. */
export function mergeRollups(rollups: readonly StatusRollup[]): StatusRollup {
  const present = rollups.filter((rollup) => rollup.total > 0);
  if (present.length === 0) return EMPTY;

  let working = 0;
  let needs = 0;
  let unread = 0;
  let total = 0;
  for (const rollup of present) {
    working += rollup.working;
    needs += rollup.needsYou;
    unread += rollup.unread;
    total += rollup.total;
  }

  const kind = worstKind(present.map((rollup) => rollup.kind));
  const lead = present.find((rollup) => rollup.kind === kind) ?? present[0];

  return {
    kind,
    total,
    working,
    needsYou: needs,
    unread,
    leadThreadId: lead?.leadThreadId ?? null,
  };
}

/**
 * Priority order, highest first. `inactive` and `stale` are the only states
 * that lose to everything, which is what lets a folded branch stay grey while
 * something three levels down is still running.
 */
const KIND_PRIORITY: readonly FamilyStatusKind[] = [
  "failed",
  "needs-you",
  "working",
  "unread",
  "inactive",
  "stale",
];

export function worstKind(
  kinds: readonly FamilyStatusKind[],
): FamilyStatusKind {
  let best = KIND_PRIORITY.length - 1;
  for (const kind of kinds) {
    const rank = KIND_PRIORITY.indexOf(kind);
    if (rank >= 0 && rank < best) best = rank;
  }
  return KIND_PRIORITY[best] ?? "inactive";
}

/** True when a rollup should draw an animated dot rather than a static one. */
export function rollupIsAnimated(rollup: StatusRollup): boolean {
  return rollup.kind === "working";
}
