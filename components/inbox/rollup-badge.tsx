import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { familyStatusPresentation } from "@/lib/family-status";
import { rollupSummary, type StatusRollup } from "@/lib/rollup";

/**
 * The folded-row status: one dot for the dominant state, then the counts that
 * are non-zero. It is deliberately the same vocabulary at every level — group,
 * project, workspace — because the point is that a folded branch reports what
 * is happening inside it the same way a single thread does.
 *
 * Counts are spelled out instead of relying on colour alone: with many
 * worktrees the tree is dense, and a coloured dot on a deep row is easy to
 * miss. "1 needs you" survives being skimmed; a red pixel does not.
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
  const idle = summary.length === 0;

  return (
    <span
      className={cn("flex shrink-0 items-center gap-1", className)}
      title={`${presentation.label}${summary ? ` · ${summary}` : ""}`}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          presentation.animated && "animate-pulse",
        )}
        style={{
          backgroundColor: `var(--nest-status-${presentation.colorRole})`,
          opacity: presentation.receded ? 0.55 : 1,
        }}
      />
      {idle ? null : (
        <span className="truncate text-2xs text-muted-foreground">
          {summary}
        </span>
      )}
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
      {target === null ? null : (
        <Icon name="ArrowRight" className="size-3 opacity-60" aria-hidden />
      )}
    </button>
  );
}
