import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import {
  PINNED_DRAG_TYPE,
  encodeDraggedPinned,
  orderPinnedFamilies,
  parseDraggedPinned,
  pinnedNeighbours,
  pinnedRootIds,
  splitPinnedFamilies,
} from "../lib/pinned.ts";
import type { ProjectThreadGroup, ThreadFamily } from "../lib/inbox.ts";

const inbox = await readFile(
  new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
  "utf8",
);
const section = await readFile(
  new URL("../components/inbox/pinned-section.tsx", import.meta.url),
  "utf8",
);
const treeRows = await readFile(
  new URL("../components/inbox/tree-rows.tsx", import.meta.url),
  "utf8",
);
const hook = await readFile(
  new URL("../hooks/use-pinned-order.ts", import.meta.url),
  "utf8",
);
const server = await readFile(new URL("../server.ts", import.meta.url), "utf8");
const card = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);
const icons = await readFile(
  new URL("../components/ui/icon.tsx", import.meta.url),
  "utf8",
);

function thread(
  id: string,
  createdAt: number,
  extra: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id,
    projectId: "p1",
    title: id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt,
    updatedAt: createdAt,
    lastReadAt: null,
    latestAttentionAt: createdAt,
    ...extra,
  };
}

function family(id: string, createdAt: number, pinned = false): ThreadFamily {
  return { root: thread(id, createdAt, { isPinned: pinned }), children: [] };
}

function group(id: string, families: ThreadFamily[]): ProjectThreadGroup {
  return { project: { id, name: id, isPersonal: false }, families };
}

describe("splitPinnedFamilies", () => {
  it("takes every project's pinned roots out of the tree", () => {
    const { pinned, rest } = splitPinnedFamilies([
      group("p1", [family("a", 3, true), family("b", 2)]),
      group("p2", [family("c", 1, true)]),
    ]);
    assert.deepEqual(
      pinned.map((entry) => entry.family.root.id),
      ["a", "c"],
    );
    assert.deepEqual(
      rest.flatMap((entry) => entry.families.map((f) => f.root.id)),
      ["b"],
    );
  });

  it("names the project each pinned root came from", () => {
    const { pinned } = splitPinnedFamilies([
      group("p2", [family("c", 1, true)]),
    ]);
    assert.equal(pinned[0]?.projectId, "p2");
    assert.equal(pinned[0]?.projectName, "p2");
  });

  // An empty group would draw a header with no rows under it, and the project is
  // still reachable from the section's own row and from bb's project list.
  it("drops a project left with nothing", () => {
    const { rest } = splitPinnedFamilies([
      group("p1", [family("a", 1, true)]),
      group("p2", [family("b", 2)]),
    ]);
    assert.deepEqual(
      rest.map((entry) => entry.project.id),
      ["p2"],
    );
  });

  it("keeps a child with its pinned parent", () => {
    const child = thread("child", 1, { parentThreadId: "a" });
    const withChild: ThreadFamily = { root: thread("a", 2, { isPinned: true }), children: [child] };
    const { pinned } = splitPinnedFamilies([group("p1", [withChild])]);
    assert.deepEqual(
      pinned[0]?.family.children.map((entry) => entry.id),
      ["child"],
    );
  });

  it("returns nothing to split when nothing is pinned", () => {
    const { pinned, rest } = splitPinnedFamilies([group("p1", [family("a", 1)])]);
    assert.deepEqual(pinned, []);
    assert.equal(rest.length, 1);
  });
});

describe("orderPinnedFamilies", () => {
  const pinned = splitPinnedFamilies([
    group("p1", [family("a", 3, true), family("b", 2, true)]),
    group("p2", [family("c", 1, true)]),
  ]).pinned;

  /**
   * bb's order, not a private one. A pin moved in the built-in sidebar has to be
   * in the same place here, or the two surfaces disagree about the same list.
   */
  it("follows bb's order rather than the tree's", () => {
    assert.deepEqual(
      pinnedRootIds(orderPinnedFamilies(pinned, ["c", "a", "b"])),
      ["c", "a", "b"],
    );
  });

  /**
   * A read that has not caught up — a pin made on another client — must not hide
   * a row. An unnamed entry lands after the named ones, newest first, which is
   * the same order the tree would have drawn it in.
   */
  it("appends what the order does not name, newest first", () => {
    assert.deepEqual(
      pinnedRootIds(orderPinnedFamilies(pinned, ["c"])),
      ["c", "a", "b"],
    );
    assert.deepEqual(
      pinnedRootIds(orderPinnedFamilies(pinned, ["b"])),
      ["b", "a", "c"],
    );
  });

  it("falls back to creation order when there is no order at all", () => {
    assert.deepEqual(
      pinnedRootIds(orderPinnedFamilies(pinned, [])),
      ["a", "b", "c"],
    );
  });

  it("keeps every row when the order names nothing it holds", () => {
    assert.equal(orderPinnedFamilies(pinned, ["gone", "also-gone"]).length, 3);
  });

  it("maps an empty section to an empty list", () => {
    assert.deepEqual(orderPinnedFamilies([], ["a"]), []);
  });
});

describe("pinnedNeighbours", () => {
  const ids = ["a", "b", "c"];

  /**
   * bb's reorder takes the ids either side of the drop, and those are the
   * neighbours the row would land between — so the list is read without the row
   * being moved. Reading it with the source still in place would name the source
   * itself as a neighbour for an adjacent drop.
   */
  it("names the pair a drop lands between", () => {
    assert.deepEqual(
      pinnedNeighbours({ orderedIds: ids, sourceId: "a", targetId: "c", position: "before" }),
      { previousThreadId: "b", nextThreadId: "c" },
    );
    assert.deepEqual(
      pinnedNeighbours({ orderedIds: ids, sourceId: "c", targetId: "a", position: "before" }),
      { previousThreadId: null, nextThreadId: "a" },
    );
    assert.deepEqual(
      pinnedNeighbours({ orderedIds: ids, sourceId: "a", targetId: "c", position: "after" }),
      { previousThreadId: "c", nextThreadId: null },
    );
  });

  it("refuses a move against the row being moved", () => {
    assert.equal(
      pinnedNeighbours({ orderedIds: ids, sourceId: "a", targetId: "a", position: "after" }),
      null,
    );
  });

  // A reorder that moves the wrong row is worse than one that does nothing.
  it("refuses an id the list does not hold", () => {
    assert.equal(
      pinnedNeighbours({ orderedIds: ids, sourceId: "gone", targetId: "a", position: "before" }),
      null,
    );
    assert.equal(
      pinnedNeighbours({ orderedIds: ids, sourceId: "a", targetId: "gone", position: "before" }),
      null,
    );
  });
});

describe("the pinned drag payload", () => {
  it("round-trips a root id", () => {
    assert.deepEqual(parseDraggedPinned(encodeDraggedPinned("thr_1")), {
      rootId: "thr_1",
    });
  });

  it("rejects anything it did not write", () => {
    for (const raw of ["", "{", "null", "[]", "{}", '{"rootId":1}', '{"rootId":""}']) {
      assert.equal(parseDraggedPinned(raw), null, raw);
    }
  });

  // Its own type, because a drop handler has to tell "move inside the project"
  // from "move inside the pinned section": they land in different stores.
  it("is not the family payload", () => {
    assert.equal(PINNED_DRAG_TYPE, "application/x-nest-pinned");
    assert.notEqual(PINNED_DRAG_TYPE, "application/x-nest-family");
  });
});

/**
 * The wiring: the section draws above the tree, the tree no longer holds the
 * pinned rows, and both reorders write where they should.
 */
describe("pinned section wiring", () => {
  it("draws above the tree", () => {
    const pinned = inbox.indexOf("<PinnedSection");
    const tree = inbox.indexOf("{treeNodes.map((node) => (");
    assert.ok(pinned >= 0 && tree > pinned);
  });

  it("removes the pinned rows from the tree it feeds", () => {
    assert.match(inbox, /splitPinnedFamilies\(searchedProjectGroups\)/);
    // The scope filter runs on the rest, not on the searched list: a pin that
    // vanished when the user looked at another group is the failure this fixes.
    assert.match(inbox, /unpinnedProjectGroups\.filter\(\(group\) =>/);
    assert.doesNotMatch(inbox, /scopedProjectGroups = searchedProjectGroups/);
  });

  it("takes the pinned rows after search and the filter, so both still apply", () => {
    const search = inbox.indexOf("searchProjectThreadGroups(");
    const split = inbox.indexOf("splitPinnedFamilies(");
    assert.ok(search >= 0 && split > search);
  });

  // A reorder writes bb's order and then re-reads. A key that changed on every
  // reorder would leave those two reads racing.
  it("keys the read on the set of pinned roots, not their order", () => {
    assert.match(hook, /export function usePinnedOrder\(pinnedIdsKey: string\)/);
    assert.match(inbox, /usePinnedOrder\(pinnedIdsKey\)/);
    assert.match(inbox, /\[\.\.\.pinnedRootIds\(pinnedFamilies\)\]\.sort\(\)\.join\("\\u0000"\)/);
  });

  it("writes through bb's own pin mutation", () => {
    assert.match(server, /async reorderPinned\(\{ threadId, previousThreadId, nextThreadId \}\)/);
    assert.match(server, /bb\.sdk\.threads\.reorderPinned\(\{/);
    assert.match(hook, /rpc\s*\.call\("reorderPinned", \{/);
  });

  // bb compares pin sort keys as byte strings. A locale-aware compare would order
  // them differently on a machine whose locale disagrees with the host's.
  it("reads the order from bb's own sort key, compared by codepoint", () => {
    assert.match(server, /listPinnedOrder: \{/);
    assert.match(server, /pinSortKey/);
    assert.match(server, /compareCodepoints\(leftKey, rightKey\)/);
    assert.doesNotMatch(server, /localeCompare\(.*pinSortKey/);
  });

  it("gives the section its own reorder, separate from the tree's", () => {
    assert.match(treeRows, /pinnedReorderEnabled/);
    assert.match(treeRows, /onPinnedKeyboardMove/);
    assert.match(section, /onReorder\(\{/);
    assert.match(inbox, /onReorder=\{pinnedOrder\.move\}/);
  });

  // The section's drop lands between two rows, so the list owns it and finds the
  // row under the pointer; the row's own drop is a no-op while pinned.
  it("puts the pinned drop on the list rather than the row", () => {
    assert.match(section, /event\.dataTransfer\.types\.includes\(PINNED_DRAG_TYPE\)/);
    assert.match(section, /closest\("\[data-nest-family\]"\)/);
    assert.match(treeRows, /pinned\s*\n?\s*\? \(\) => undefined/);
  });
});

/**
 * The pin on the row itself.
 *
 * The section answers *which* threads are pinned; the row's own control answers
 * whether this one is, and it is the way back out of the section — a pin you can
 * only undo from a right-click menu is a pin you have to remember you made. One
 * control with two states: the fill carries the state, the press carries the
 * toggle, so neither has to be guessed from the other.
 */
describe("the row's pin control", () => {
  const pinButton = card.slice(card.indexOf("function PinButton"));

  it("is solid on a pinned thread and outlined on one that is not", () => {
    assert.match(pinButton, /name=\{pinned \? "PinFilled" : "Pin"\}/);
    assert.match(pinButton, /data-nest-pin=\{pinned \? "pinned" : "unpinned"\}/);
    // A toggle reports the state it holds, rather than only naming its action.
    assert.match(pinButton, /aria-pressed=\{pinned\}/);
    assert.match(
      pinButton,
      /const label = pinned \? "Unpin thread" : "Pin thread"/,
    );
    // The decorative marker it replaces: a pin that said "pinned" and could not
    // be pressed.
    assert.doesNotMatch(card, /title="Pinned thread"/);
  });

  it("writes the pin through bb's own mutation", () => {
    assert.match(card, /void actions\.setPinned\(thread\.id, !thread\.isPinned\)/);
  });

  it("draws it at rest on a pinned thread and under the pointer on the rest", () => {
    assert.match(
      card,
      /const showRootPin =\n\s+!selectionMode && \(thread\.isPinned \|\| \(showRowDetails && reveal\.revealed\)\);/,
    );
    assert.match(
      card,
      /const showRootRail =\n\s+showRootPin \|\| showRootParkActions \|\| showRootTime \|\| hasRootMetadata;/,
    );
  });

  it("leads the cluster, so appearing beside the controls cannot move them", () => {
    const cluster = card.slice(
      card.indexOf("const rootTrailingCluster"),
      card.indexOf('data-nest-root-metadata=""'),
    );
    assert.ok(cluster.indexOf("<PinButton") >= 0, "the cluster draws the pin");
    assert.ok(
      cluster.indexOf("<PinButton") < cluster.indexOf("data-nest-root-time"),
      "the pin is the first thing the cluster adds",
    );
  });

  it("makes the solid glyph from the outlined one rather than importing a second", () => {
    // Hugeicons' free set has no solid pin. Filling by rule — every closed
    // outline takes the fill, every open one stays a stroke — is what keeps the
    // two states one silhouette, and what fails loudly rather than silently if
    // the artwork is ever redrawn as lines.
    assert.match(icons, /const PinFilledIcon: IconSvgElement = PinIcon\.map\(/);
    assert.match(icons, /attrs\.d\.trimEnd\(\)\.endsWith\("Z"\)/);
    assert.match(icons, /fill: "currentColor"/);
    assert.match(icons, /PinFilled: PinFilledIcon/);
  });
});