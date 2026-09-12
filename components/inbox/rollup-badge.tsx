import { cn } from "@/lib/utils";
import { StatusCount, StatusDot } from "@/components/inbox/family-status";
import {
  familyStatusPresentation,
  type FamilyStatusKind,
} from "@/lib/family-status";
import { rollupSummary, type StatusRollup } from "@/lib/rollup";

/**
 * The folded-row status: one dot per non-zero state, each followed by its
 * count, most urgent first, at every level — group, project, workspace.
 *
 * Numbers instead of words because a folded row is a summary, not a sentence:
 * the sidebar is the scarcest surface in bb, and "2 · 1" beside two coloured
 * dots reads faster than "2 needs you · 1 working" while costing a fraction of
 * the width. The words survive in the tooltip and in the screen-reader label,
 * so nothing is colour-only. When every thread underneath is quiet there is no
 * count to show, and a single receded dot says so.
 */
export function RollupBadge({
  rollup,
  className,
}: {
  rollup: StatusRollup;
  className?: string;
}) {
  if (rollup.total === 0) return null;
  const presentation = familyStatusPresentation(rollup.kind);
  const summary = rollupSummary(rollup);
  const counts = rollupCounts(rollup);

  return (
    <span
      className={cn("flex shrink-0 items-center gap-1", className)}
      title={`${presentation.label}${summary ? ` · ${summary}` : ""}`}
    >
      {counts.length === 0 ? (
        <StatusDot status={presentation} />
      ) : (
        counts.map((entry) => (
          <StatusCount
            key={entry.kind}
            status={familyStatusPresentation(entry.kind)}
            count={entry.count}
          />
        ))
      )}
      <span className="sr-only">
        {presentation.label}
        {summary ? `, ${summary}` : ""}
      </span>
    </span>
  );
}

/**
 * Non-zero counts, most urgent first, so the leftmost number is the one that
 * matters. Mirrors the rollup priority: failed > needs you > working > unread.
 */
function rollupCounts(
  rollup: StatusRollup,
): ReadonlyArray<{ kind: FamilyStatusKind; count: number }> {
  const ordered: ReadonlyArray<{ kind: FamilyStatusKind; count: number }> = [
    { kind: "failed", count: rollup.failed },
    { kind: "needs-you", count: rollup.needsYou },
    { kind: "working", count: rollup.working },
    { kind: "unread", count: rollup.unread },
  ];
  return ordered.filter((entry) => entry.count > 0);
}

/**
 * The click target that turns a rollup into navigation: clicking the badge
 * jumps to the thread the dominant state came from, rather than expanding the
 * branch and making the user find it. Falls back to toggling the row when the
 * rollup names no thread.
 */
export function RollupJump({
  rollup,
  onJump,
  onFallback,
}: {
  rollup: StatusRollup;
  onJump: (threadId: string) => void;
  onFallback: () => void;
}) {
  const target = rollup.leadThreadId;
  const summary = rollupSummary(rollup);
  if (rollup.total === 0) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (target !== null) onJump(target);
        else onFallback();
      }}
      title={
        target !== null
          ? `Jump to the thread that ${summary || "needs you"}`
          : "Nothing to jump to"
      }
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-1 py-0.5",
        "text-2xs text-muted-foreground",
        "hover:bg-sidebar-accent hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <RollupBadge rollup={rollup} />
    </button>
  );
}
