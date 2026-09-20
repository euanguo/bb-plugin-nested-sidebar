import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/inbox/family-status";
import {
  familyStatusPresentation,
  type FamilyStatusKind,
} from "@/lib/family-status";
import { rollupSummary, type StatusRollup } from "@/lib/rollup";

/**
 * The folded-row status is deliberately one dot. Counts are useful in a
 * report, but they are not useful in this narrow navigation surface: the dot
 * answers the only question the collapsed row needs to answer — is anything
 * below active or waiting? The full state and counts remain in the title and
 * accessible label, so the visual row does not spend width on them.
 */
export function RollupBadge({
  rollup,
  className,
}: {
  rollup: StatusRollup;
  className?: string;
}) {
  // A quiet subtree has no status signal to communicate. In particular, do
  // not render the inactive/stale dot on every project: the dot means
  // something below needs attention or is active, not merely that the row has
  // children.
  if (rollup.total === 0 || rollup.kind === "inactive" || rollup.kind === "stale") return null;
  const presentation = familyStatusPresentation(rollup.kind);
  const summary = rollupSummary(rollup);

  return (
    <span
      className={cn("flex size-3 shrink-0 items-center justify-center", className)}
      title={`${presentation.label}${summary ? ` · ${summary}` : ""}`}
    >
      <StatusDot status={presentation} />
      <span className="sr-only">
        {presentation.label}
        {summary ? `, ${summary}` : ""}
      </span>
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
