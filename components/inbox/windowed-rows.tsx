/**
 * A long list of rows, with only the ones near the viewport in the DOM.
 *
 * The arithmetic — and the two rules that make windowing safe — are in
 * `lib/windowing.ts`. This is the DOM half: it measures what it rendered,
 * watches the scroll container, and stands a spacer in for every row it did not
 * render. The spacer carries the shortcut anchors those rows would have had, so
 * bb's numbered thread jumps keep resolving to threads that are not on screen.
 *
 * **It declines to window whenever the list is interactive in a way a spacer
 * would break**, which is the important half of the design:
 *
 * - while a reorder is enabled, because a drag has to be able to land *between*
 *   two rows and a spacer is not a drop target;
 * - while bulk selection is on, because a checkbox that is not rendered cannot
 *   be checked, and a selection that silently misses rows is worse than a slow
 *   list;
 * - and below `WINDOWING_THRESHOLD` rows, because the observer is itself work.
 *
 * So the common case renders exactly the tree it always rendered, and the guard
 * is a condition rather than a hope.
 *
 * A row is measured through the `data-nest-family` its own `<li>` already
 * carries. There is deliberately no wrapper element: the rows are `<li>`s inside
 * this list, a wrapper would be a second box in every list Nest draws, and an
 * `<li>` inside an `<li>` is not markup this sidebar is willing to ship.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ESTIMATED_ROW_HEIGHT_PX,
  layoutHeights,
  rowWindow,
  shouldWindow,
  spacerShortcutIds,
} from "@/lib/windowing";

/** The scroll container a windowed list measures against. */
export const SCROLL_CONTAINER_ATTRIBUTE = "data-nest-scroll";

/** The attribute a row already carries, used here as the measurement key. */
const ROW_KEY_ATTRIBUTE = "nestFamily";

export function WindowedRows({
  keys,
  renderRow,
  shortcutIdFor,
  onOpenShortcut,
  windowable,
  className,
  id,
}: {
  keys: readonly string[];
  renderRow: (key: string) => ReactNode;
  /** The thread id a row's shortcut anchor should carry, or null. */
  shortcutIdFor: (key: string) => string | null;
  /** Open a thread a shortcut jumped to. */
  onOpenShortcut: (threadId: string) => void;
  /** False while a drag or a bulk selection would be broken by a spacer. */
  windowable: boolean;
  className?: string;
  id?: string;
}) {
  const containerRef = useRef<HTMLUListElement>(null);
  const measured = useRef(new Map<string, number>());
  const [scroll, setScroll] = useState({ top: 0, height: 0 });

  const active = windowable && shouldWindow(keys.length);
  const keySignature = useMemo(() => keys.join("\u0000"), [keys]);

  // A row that has left the list must not keep a stale height: the offsets are
  // what the spacer is, and one that no longer adds up moves the rows under it.
  useEffect(() => {
    const live = new Set(keys);
    for (const key of [...measured.current.keys()]) {
      if (!live.has(key)) measured.current.delete(key);
    }
  }, [keySignature, keys]);

  const heights = useMemo(
    () =>
      layoutHeights({
        keys,
        measured: measured.current,
        estimate: ESTIMATED_ROW_HEIGHT_PX,
      }),
    // `scroll` is in the deps on purpose: measuring happens after a render, and
    // the offsets have to be recomputed once the measurements have landed.
    [keySignature, keys, scroll],
  );

  const span = active
    ? rowWindow({
        heights,
        scrollTop: scroll.top,
        viewportHeight: scroll.height,
      })
    : { start: 0, end: keys.length, leading: 0, trailing: 0 };
  const spacers = spacerShortcutIds(keys, span);

  const readContainer = useCallback((): HTMLElement | null => {
    const element = containerRef.current?.closest(
      `[${SCROLL_CONTAINER_ATTRIBUTE}]`,
    );
    return element instanceof HTMLElement ? element : null;
  }, []);

  const readGeometry = useCallback((container: HTMLElement) => {
    setScroll((current) => {
      const top = container.scrollTop;
      const height = container.clientHeight;
      return current.top === top && current.height === height
        ? current
        : { top, height };
    });
  }, []);

  // Measure what was rendered, then read the container. Both after layout, so
  // the spacer is never a frame behind the rows it stands for.
  useLayoutEffect(() => {
    if (!active) return;
    const list = containerRef.current;
    if (list === null) return;
    for (const child of list.children) {
      if (!(child instanceof HTMLElement)) continue;
      const key = child.dataset[ROW_KEY_ATTRIBUTE];
      if (key === undefined) continue;
      const height = child.getBoundingClientRect().height;
      if (height > 0) measured.current.set(key, height);
    }
    const container = readContainer();
    if (container !== null) readGeometry(container);
  });

  useEffect(() => {
    if (!active) return;
    const container = readContainer();
    if (container === null) return;
    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        readGeometry(container);
      });
    };
    const onResize = () => readGeometry(container);
    readGeometry(container);
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active, readContainer, readGeometry]);

  return (
    <ul ref={containerRef} id={id} className={className ?? "contents"}>
      {spacers.leading.length === 0 ? null : (
        <Spacer
          height={sum(heights.slice(0, span.start))}
          ids={spacers.leading.map(shortcutIdFor)}
          onOpenShortcut={onOpenShortcut}
        />
      )}
      {keys.slice(span.start, span.end).map((key) => renderRow(key))}
      {spacers.trailing.length === 0 ? null : (
        <Spacer
          height={sum(heights.slice(span.end))}
          ids={spacers.trailing.map(shortcutIdFor)}
          onOpenShortcut={onOpenShortcut}
        />
      )}
    </ul>
  );
}

/**
 * The rows a windowed list did not render, as one box of their combined height
 * plus the anchors they would have carried.
 */
function Spacer({
  height,
  ids,
  onOpenShortcut,
}: {
  height: number;
  ids: readonly (string | null)[];
  onOpenShortcut: (threadId: string) => void;
}) {
  return (
    <li aria-hidden style={{ height }} className="list-none">
      {/*
        `hidden` rather than absent. bb's numbered thread jumps work by querying
        the DOM for these two attributes and calling `.click()` on what they
        find, and a programmatic click reaches a hidden element. A row that is
        merely not rendered takes its shortcut with it, silently, which is the
        one failure windowing cannot have.
      */}
      <span hidden>
        {ids.map((id, index) =>
          id === null ? null : (
            <a
              // The index is in the key because a spacer can hold two rows that
              // share an id, and a duplicate key would drop one of them.
              key={`${id}:${index}`}
              href="#"
              data-sidebar-thread-shortcut-target=""
              data-sidebar-thread-id={id}
              onClick={(event) => {
                event.preventDefault();
                onOpenShortcut(id);
              }}
            />
          ),
        )}
      </span>
    </li>
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}