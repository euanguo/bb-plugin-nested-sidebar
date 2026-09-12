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

  it("keeps rename reachable from the level it belongs to", () => {
    assert.match(projectRow, /label="Rename…"/);
    // A worktree renames the environment, which is what its alias is.
    assert.match(treeRows, /label="Rename worktree…"/);
    assert.match(groupRow, /label="Rename…"/);
    assert.match(card, /label="Open in split"/);
  });

  it("shows each group's own edit affordance before the name", () => {
    // The pencil is part of the label, and it is only a control once revealed.
    const icon = groupRow.indexOf('<Icon name="Edit"');
    // The rendered label element, not name={node.name} on the editor above it.
    const name = groupRow.indexOf(
      "truncate text-xs font-semibold text-foreground/90",
    );
    assert.ok(icon >= 0 && name > icon);
    assert.match(groupRow, /group-hover\/group:flex/);
  });

  it("tags each group tab with its own status so the strip can dot it", () => {
    assert.match(tabs, /statusKind: FamilyStatusKind \| null/);
    assert.match(tabs, /familyStatusPresentation\(tab\.statusKind\)/);
  });

  it("opens a hover card from every level", () => {
    for (const source of [groupRow, projectRow, treeRows, card]) {
      assert.match(source, /<InfoCard/);
    }
  });
});
