/**
 * Which rows of a long list are worth having in the DOM.
 *
 * The sidebar draws a card per thread family, and a card is not cheap: a status
 * glyph, a title, a branch line, a metadata cluster, a menu, and a full-bleed
 * anchor. A project with a few hundred threads therefore costs a few hundred of
 * those, most of them off screen, and the cost is paid on every render rather
 * than only on the ones that changed.
 *
 * The arithmetic is here rather than in the component so it can be tested
 * without a DOM, and so the two things that make windowing *safe* are stated
 * once:
 *
 * 1. **A row that is not realized still occupies its height.** A placeholder of
 *    the measured height — or, before a row has ever been measured, of an
 *    estimate — keeps the scroll position and the scrollbar honest. A list that
 *    collapsed its unrendered rows would jump under the user's cursor.
 * 2. **A row that is not realized still answers its shortcut.** bb's numbered
 *    thread jumps work by querying the DOM for `[data-sidebar-thread-shortcut-target]`
 *    and reading `dataset.sidebarThreadId`. A row that is simply absent takes
 *    its shortcut with it, silently, which is the one failure this cannot have.
 *    So a placeholder carries the same two attributes as the row it stands in
 *    for, and the caller renders them.
 *
 * What this deliberately does not do: it does not try to be a virtual list. It
 * realizes a contiguous span around the viewport and keeps every row outside it
 * as a spacer, because the tree's rows are nested and a nested list has no
 * single index to map a scroll offset onto.
 */

/**
 * Below this many rows, windowing costs more than it saves.
 *
 * An observer per row is itself work, and a list this short is already cheap to
 * render. The threshold is also what keeps the common case byte-for-byte the
 * rendering it was before windowing existed: a sidebar with a handful of
 * projects draws exactly the tree it always drew.
 */
export const WINDOWING_THRESHOLD = 80;

/** Rows kept realized beyond each edge of the viewport, as a multiple of it. */
export const OVERSCAN_RATIO = 1;

/** The height assumed for a row nothing has measured yet. */
export const ESTIMATED_ROW_HEIGHT_PX = 44;

export function shouldWindow(rowCount: number): boolean {
  return rowCount > WINDOWING_THRESHOLD;
}

export interface RowWindow {
  /** Rows to render, as a half-open span over the key list. */
  readonly start: number;
  readonly end: number;
  /** Rows to render as spacers, before and after the span. */
  readonly leading: number;
  readonly trailing: number;
}

/**
 * The span of rows to realize, and how many sit outside it.
 *
 * Heights are per row and may be measured or estimated, which is what makes the
 * offsets add up for a list whose rows differ — a collapsed family is one line
 * and an expanded one is a card plus its children.
 */
export function rowWindow(input: {
  heights: readonly number[];
  /** How far the scroll container has scrolled, in pixels. */
  scrollTop: number;
  /** The container's visible height, in pixels. */
  viewportHeight: number;
  overscan?: number;
}): RowWindow {
  const { heights, scrollTop, viewportHeight } = input;
  const total = heights.length;
  if (total === 0) {
    return { start: 0, end: 0, leading: 0, trailing: 0 };
  }
  const overscan = input.overscan ?? Math.round(viewportHeight * OVERSCAN_RATIO);
  const top = scrollTop - overscan;
  const bottom = scrollTop + viewportHeight + overscan;

  // Walk the offsets rather than binary-searching them: a list long enough for
  // that to matter is a list whose rows are cheap enough that this is not the
  // cost.
  let offset = 0;
  let start = 0;
  let end = 0;
  for (let index = 0; index < total; index += 1) {
    const height = heights[index] ?? ESTIMATED_ROW_HEIGHT_PX;
    const rowTop = offset;
    const rowBottom = offset + height;
    offset = rowBottom;
    if (rowBottom <= top) {
      // Above the window. `start` follows, so it ends up on the first row whose
      // bottom is inside it.
      start = index + 1;
      end = index + 1;
      continue;
    }
    if (rowTop >= bottom) {
      // Below the window, and every row after it is too, because the offsets
      // only increase.
      break;
    }
    end = index + 1;
  }
  // A viewport past the end of the list still shows the last row, or the user
  // scrolls into empty space. Only reachable with a stale measurement — the
  // spacer's height is what keeps the scroll inside the content — which is
  // exactly why it is worth a line rather than a crash.
  if (end <= start) {
    end = total;
    start = Math.max(0, total - 1);
  }
  return { start, end, leading: start, trailing: total - end };
}

/**
 * The heights to lay out with, given what has been measured.
 *
 * A measured height is used as measured; anything else takes the estimate. The
 * caller keeps the measurements because only it can see the DOM, and it forgets
 * one when the row's shape changes — an expanded family is not the height its
 * collapsed self was.
 */
export function layoutHeights(input: {
  keys: readonly string[];
  measured: ReadonlyMap<string, number>;
  estimate?: number;
}): number[] {
  const estimate = input.estimate ?? ESTIMATED_ROW_HEIGHT_PX;
  return input.keys.map((key) => {
    const measured = input.measured.get(key);
    // A zero or negative measurement is a row that was measured while hidden,
    // which says nothing about how tall it is.
    return measured !== undefined && measured > 0 ? measured : estimate;
  });
}

/**
 * The thread ids a spacer stands in for, so their shortcuts still resolve.
 *
 * Ordered, because the host walks the DOM in visual order and that order is the
 * shortcut order: a spacer that reported its ids in any other order would move
 * every numbered jump after it.
 */
export function spacerShortcutIds(
  keys: readonly string[],
  window: RowWindow,
): { leading: readonly string[]; trailing: readonly string[] } {
  return {
    leading: keys.slice(0, window.start),
    trailing: keys.slice(window.end),
  };
}