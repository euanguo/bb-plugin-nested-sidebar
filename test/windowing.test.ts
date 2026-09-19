import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  ESTIMATED_ROW_HEIGHT_PX,
  OVERSCAN_RATIO,
  WINDOWING_THRESHOLD,
  layoutHeights,
  rowWindow,
  shouldWindow,
  spacerShortcutIds,
} from "../lib/windowing.ts";

const windowed = await readFile(
  new URL("../components/inbox/windowed-rows.tsx", import.meta.url),
  "utf8",
);
const treeRows = await readFile(
  new URL("../components/inbox/tree-rows.tsx", import.meta.url),
  "utf8",
);
const inbox = await readFile(
  new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
  "utf8",
);

/** Ten rows of ten pixels: the offsets are easy to reason about by hand. */
const even = Array.from({ length: 10 }, () => 10);

describe("shouldWindow", () => {
  it("leaves a short list alone", () => {
    assert.equal(shouldWindow(0), false);
    assert.equal(shouldWindow(WINDOWING_THRESHOLD), false);
  });

  it("windows a list past the threshold", () => {
    assert.equal(shouldWindow(WINDOWING_THRESHOLD + 1), true);
  });
});

describe("rowWindow", () => {
  it("realizes what the viewport shows", () => {
    const span = rowWindow({
      heights: even,
      scrollTop: 0,
      viewportHeight: 30,
      overscan: 0,
    });
    assert.deepEqual(span, { start: 0, end: 3, leading: 0, trailing: 7 });
  });

  it("follows the scroll offset", () => {
    const span = rowWindow({
      heights: even,
      scrollTop: 50,
      viewportHeight: 30,
      overscan: 0,
    });
    assert.equal(span.start, 5);
    assert.equal(span.end, 8);
    assert.equal(span.leading, 5);
    assert.equal(span.trailing, 2);
  });

  it("keeps rows beyond each edge by the overscan", () => {
    const span = rowWindow({
      heights: even,
      scrollTop: 50,
      viewportHeight: 30,
      overscan: 20,
    });
    assert.equal(span.start, 3);
    assert.equal(span.end, 10);
  });

  /**
   * A viewport scrolled past the end still shows the last rows. Without this the
   * user scrolls into empty space, because the span would collapse to nothing.
   */
  it("shows the last row when scrolled past the end", () => {
    const span = rowWindow({
      heights: even,
      scrollTop: 500,
      viewportHeight: 30,
      overscan: 0,
    });
    assert.deepEqual(span, { start: 9, end: 10, leading: 9, trailing: 0 });
  });

  it("has nothing to show for an empty list", () => {
    assert.deepEqual(
      rowWindow({ heights: [], scrollTop: 0, viewportHeight: 100 }),
      { start: 0, end: 0, leading: 0, trailing: 0 },
    );
  });

  /**
   * Rows differ — a collapsed family is one line, an expanded one is a card plus
   * its children — so the offsets are walked rather than divided by a row count.
   */
  it("adds up rows of different heights", () => {
    const heights = [10, 100, 10, 10, 10];
    const span = rowWindow({
      heights,
      scrollTop: 0,
      viewportHeight: 25,
      overscan: 0,
    });
    // The tall second row alone fills the viewport, so the third is the first
    // that is out of it.
    assert.equal(span.end, 2);
  });

  it("keeps a whole list that fits", () => {
    const span = rowWindow({
      heights: even,
      scrollTop: 0,
      viewportHeight: 500,
      overscan: 0,
    });
    assert.deepEqual(span, { start: 0, end: 10, leading: 0, trailing: 0 });
  });

  it("defaults the overscan to a viewport's worth", () => {
    assert.deepEqual(
      rowWindow({ heights: even, scrollTop: 50, viewportHeight: 20 }),
      rowWindow({
        heights: even,
        scrollTop: 50,
        viewportHeight: 20,
        overscan: Math.round(20 * OVERSCAN_RATIO),
      }),
    );
  });
});

describe("layoutHeights", () => {
  it("uses a measurement where there is one", () => {
    assert.deepEqual(
      layoutHeights({ keys: ["a", "b"], measured: new Map([["a", 99]]) }),
      [99, ESTIMATED_ROW_HEIGHT_PX],
    );
  });

  // A row measured while hidden says nothing about how tall it is, and taking it
  // would collapse the spacer for every row after it.
  it("ignores a measurement that cannot be a height", () => {
    assert.deepEqual(
      layoutHeights({
        keys: ["a"],
        measured: new Map([["a", 0]]),
        estimate: 30,
      }),
      [30],
    );
  });

  it("takes an estimate", () => {
    assert.deepEqual(
      layoutHeights({ keys: ["a"], measured: new Map(), estimate: 12 }),
      [12],
    );
  });
});

describe("spacerShortcutIds", () => {
  const keys = ["a", "b", "c", "d"];

  /**
   * Ordered, because the host walks the DOM in visual order and that order *is*
   * the shortcut order: a spacer that reported its ids in any other order would
   * move every numbered jump after it.
   */
  it("splits the unrendered rows into the two spacers, in order", () => {
    const spacers = spacerShortcutIds(keys, {
      start: 1,
      end: 3,
      leading: 1,
      trailing: 1,
    });
    assert.deepEqual(spacers.leading, ["a"]);
    assert.deepEqual(spacers.trailing, ["d"]);
  });

  it("has nothing to stand in for when everything is realized", () => {
    const spacers = spacerShortcutIds(keys, {
      start: 0,
      end: 4,
      leading: 0,
      trailing: 0,
    });
    assert.deepEqual(spacers, { leading: [], trailing: [] });
  });
});

/**
 * The wiring, and the guards that make windowing safe rather than merely fast.
 */
describe("windowing wiring", () => {
  it("stands down while a drag or a bulk selection is in play", () => {
    assert.match(
      treeRows,
      /function mayWindow\(handlers: TreeRowHandlers\): boolean \{\s*return !handlers\.selectionMode && !handlers\.reorderEnabled;\s*\}/,
    );
    // Both family lists take the same guard, or one of them would window while
    // the other did not.
    assert.equal((treeRows.match(/windowable=\{mayWindow\(handlers\)\}/g) ?? []).length, 2);
  });

  it("windows both family lists, and only those", () => {
    assert.equal((treeRows.match(/<WindowedRows/g) ?? []).length, 2);
    // The pinned section is not windowed: it is bounded by how many threads a
    // user pins, and its drops are the list's own.
    assert.doesNotMatch(treeRows, /pinned[\s\S]{0,200}<WindowedRows/);
  });

  /**
   * A row that is not rendered must still answer its shortcut. bb's jumps query
   * the DOM for these two attributes and call `.click()` on what they find, and
   * a programmatic click reaches a hidden element.
   */
  it("gives every spacer the shortcut anchors its rows would have carried", () => {
    assert.match(windowed, /data-sidebar-thread-shortcut-target=""/);
    assert.match(windowed, /data-sidebar-thread-id=\{id\}/);
    assert.match(windowed, /<span hidden>/);
    assert.match(windowed, /onOpenShortcut\(id\)/);
  });

  it("keeps the spacer at the height of the rows it stands for", () => {
    assert.match(windowed, /style=\{\{ height \}\}/);
    assert.match(windowed, /sum\(heights\.slice\(0, span\.start\)\)/);
    assert.match(windowed, /sum\(heights\.slice\(span\.end\)\)/);
  });

  // The list measures against the surface that scrolls, and finds it by walking
  // up rather than by a prop the tree would have to thread through four levels.
  it("measures against the surface that actually scrolls", () => {
    assert.match(inbox, /data-nest-scroll=""/);
    assert.match(windowed, /closest\(\s*`\[\$\{SCROLL_CONTAINER_ATTRIBUTE\}\]`,?\s*\)/);
  });

  /**
   * There is deliberately no wrapper element: the rows are `<li>`s inside this
   * list, and an `<li>` inside an `<li>` is not markup this sidebar ships.
   */
  it("measures rows through the attribute they already carry", () => {
    assert.match(windowed, /child\.dataset\[ROW_KEY_ATTRIBUTE\]/);
    assert.match(windowed, /const ROW_KEY_ATTRIBUTE = "nestFamily"/);
  });
});