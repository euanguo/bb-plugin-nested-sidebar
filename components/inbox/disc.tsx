import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

/**
 * A per-thread dot. Colour comes from the thread's id so the same thread keeps
 * the same colour everywhere it appears, and every hue is a rotation of one
 * accent, so a custom palette still applies.
 *
 * `thread` is null for the "and more" disc in a cluster.
 */
export function Disc({
  thread,
  compact = false,
}: {
  thread: PluginSidebarThread | null;
  /** A size down, for a cluster that has to sit inside a chip. */
  compact?: boolean;
}) {
  const hue = thread === null ? 0 : hashHue(thread.id);
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border border-background",
        compact ? "size-2.5" : "size-3.5",
      )}
      style={{
        backgroundColor:
          thread === null
            ? "var(--muted-foreground)"
            : `oklch(0.72 0.13 ${hue})`,
      }}
    />
  );
}

/**
 * Up to `max` of a thread's children, overlapping, plus an "and more" disc when
 * there are more. Shared by the thread header's chip and the row's, so the two
 * cannot disagree about what a cluster of children looks like.
 */
export function DiscCluster({
  threads,
  max = 3,
  compact = false,
}: {
  threads: readonly PluginSidebarThread[];
  max?: number;
  compact?: boolean;
}) {
  const shown = threads.slice(0, max);
  const overlap = compact ? "-ml-1" : "-ml-1.5";
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {shown.map((thread, index) => (
        <span key={thread.id} className={cn(index > 0 && overlap)}>
          <Disc thread={thread} compact={compact} />
        </span>
      ))}
      {threads.length > max ? (
        <span className={overlap}>
          <Disc thread={null} compact={compact} />
        </span>
      ) : null}
    </span>
  );
}

export function hashHue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }
  return hash;
}
