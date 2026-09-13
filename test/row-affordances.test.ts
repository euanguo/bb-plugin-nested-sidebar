import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (relative: string) =>
  readFile(new URL(`../components/inbox/${relative}`, import.meta.url), "utf8");

const groupRow = await read("group-section.tsx");
const projectRow = await read("project-node.tsx");
const treeRows = await read("tree-rows.tsx");
const card = await read("thread-card.tsx");
const tabs = await read("group-tabs.tsx");

/**
 * The four levels have to behave the same way, because they are one tree. These
 * pin the shared shape — hover reveals the menu, one frequent action keeps its
 * own button, everything else is inside the menu — rather than any single
 * level's wording.
 */
describe("row affordances across the four levels", () => {
  it("gives every level a revealed menu trigger", () => {
    for (const [level, source] of [
      ["group", groupRow],
      ["project", projectRow],
      ["worktree", treeRows],
      ["thread", card],
    ] as const) {
      assert.match(source, /<RowMenuTrigger/, `${level} has a menu trigger`);
      assert.match(
        source,
        /revealed=\{reveal\.revealed\}/,
        `${level} drives the trigger from its own hover state`,
      );
      assert.match(
        source,
        /useRowReveal\(\)/,
        `${level} tracks hover in React, not with group-hover`,
      );
    }
  });

  it("keeps the frequent new-thread button on project and worktree rows", () => {
    // Both levels start work in a known place, so both keep the button outside
    // the menu; the menu carries the rarer "new worktree" decision.
    for (const source of [projectRow, treeRows]) {
      assert.match(source, /<RowActionButton/);
      assert.match(source, /icon="Add"/);
    }
    assert.match(projectRow, /label="New worktree…"/);
    assert.match(treeRows, /label="New thread here"/);
  });

  it("keeps rename reachable through the central group manager", () => {
    assert.match(projectRow, /label="Rename…"/);
    // A worktree renames the environment, which is what its alias is.
    assert.match(treeRows, /label="Rename worktree…"/);
    assert.doesNotMatch(groupRow, /label="Rename…"/);
    assert.match(card, /label="Open in split"/);
  });

  it("keeps group editing in the central manager", () => {
    assert.doesNotMatch(groupRow, /GroupNameField/);
    assert.doesNotMatch(groupRow, /name="Edit"/);
  });

  it("tags each group tab with its own status so the strip can dot it", () => {
    assert.match(tabs, /statusKind: FamilyStatusKind \| null/);
    assert.match(tabs, /familyStatusPresentation\(tab\.statusKind\)/);
    assert.doesNotMatch(tabs, /tab\.count/);
  });

  it("opens a hover card from aggregate levels, not thread rows", () => {
    for (const source of [groupRow, projectRow, treeRows]) {
      assert.match(source, /<InfoCard/);
    }
    assert.doesNotMatch(card, /<InfoCard/);
    assert.match(projectRow, /<InfoCard trigger={projectRow}/);
  });

  it("keeps the provider at the trailing edge and overlays actions there", () => {
    assert.match(card, /data-nest-root-metadata=""[\s\S]*className="relative flex/);
    assert.match(card, /ROW_MENU_OVERLAY_CLASS/);
    assert.match(card, /function ChildThreadRow[\s\S]*useRowReveal()/);
  });
});
