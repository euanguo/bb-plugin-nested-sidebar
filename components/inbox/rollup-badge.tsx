import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/inbox/family-status";
import { familyStatusPresentation } from "@/lib/family-status";
import {
  rollupCounts,
  rollupSummary,
  type StatusRollup,
} from "@/lib/rollup";

/**
 * A folded row's status: one dot per signal that is present, each with its
 * count, most urgent first — `● 2  ● 1` rather than a bare dot.
 *
 * This started as a single dot, on the argument that a narrow navigation surface
 * has no room for counts. That argument was wrong in the one place it mattered:
 * a folded row is *skimmed*, and the question being skimmed for is not "is
 * anything happening" but "how much, and of what". Two working threads and one
 * waiting on you are the same dot and very different mornings. The wording is
 * still in the title and the accessible label, so nothing here is only a colour.
 *
 * The width is bounded by construction: at most four dots, one per signal that
 * `rollupCounts` can return, and a quiet subtree draws nothing at all.
 */
export function RollupBadge({
  rollup,
  className,
}: {
  rollup: StatusRollup;
  className?: string;
}) {
  // A quiet subtree has no status signal to communicate. In particular, do not
  // render the inactive/stale dot on every project: the dot means something
  // below needs attention or is active, not merely that the row has children.
  if (
    rollup.total === 0 ||
    rollup.kind === "inactive" ||
    rollup.kind === "stale"
  ) {
    return null;
  }
  const presentation = familyStatusPresentation(rollup.kind);
  const summary = rollupSummary(rollup);
  const counts = rollupCounts(rollup);
  /**
   * The summary, or the label when there is no count to name.
   *
   * The summary already lists the states in priority order and its first entry
   * is the dominant one, so prefixing the label said the same thing twice: a
   * folded row was read out as "Working · 1 working" in the running app. The
   * label survives as the fallback for a rollup with no counts — unreachable
   * behind the guard above, but a fallback that is never wrong costs less than a
   * title that sometimes is.
   */
  const label = summary === "" ? presentation.label : summary;

  return (
    <span
      className={cn("flex shrink-0 items-center gap-1", className)}
      title={label}
    >
      {counts.map((entry) => (
        <span key={entry.kind} className="flex items-center gap-0.5">
          <StatusDot status={familyStatusPresentation(entry.kind)} />
          <span className="tabular-nums">{entry.count}</span>
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  );
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
  if (
    rollup.total === 0 ||
    rollup.kind === "inactive" ||
    rollup.kind === "stale"
  ) {
    return null;
  }
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
        "transition-[filter] duration-150 ease-out hover:brightness-125 motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <RollupBadge rollup={rollup} />
    </button>
  );
}
