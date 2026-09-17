import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (relative: string) =>
  readFile(new URL(`../components/inbox/${relative}`, import.meta.url), "utf8");

const groupRow = await read("group-section.tsx");
const projectRow = await read("project-node.tsx");
const treeRows = await read("tree-rows.tsx");
const card = await read("thread-card.tsx");
const threadMenu = await read("thread-menu-items.tsx");
const contextMenu = await read("row-context-menu.tsx");
const tabs = await read("group-tabs.tsx");
const groupManager = await read("group-manager-dialog.tsx");

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

  /**
   * The personal project has no checkout, and the worktree environment provider
   * requires one (`requires: { gitCheckout: true }`) — so a worktree there is
   * not a thing that can be created, and offering the item opens a composer
   * with no worktree in it.
   */
  it("keeps the worktree entry off the project that has no checkout", () => {
    assert.match(projectRow, /isPersonal=\{node\.project\.isPersonal\}/);
    assert.match(
      projectRow,
      /isPersonal \? null : \(\s*<MenuItem[\s\S]*?label="New worktree…"/,
    );
  });

  it("keeps rename reachable from every level", () => {
    assert.match(projectRow, /label="Rename…"/);
    // A worktree renames the environment, which is what its alias is.
    assert.match(treeRows, /node\.ref\.kind === "git-worktree" \? "Rename worktree…"/);
    // The group row menu mirrors bb's own section menu, which offers rename
    // and remove next to the disclosure toggle.
    assert.match(groupRow, /label="Rename…"/);
    assert.match(groupRow, /label="Remove group"/);
    assert.match(card, /useThreadMenuActions/);
  });

  it("keeps group editing available from the row and the manager", () => {
    assert.doesNotMatch(groupRow, /GroupNameField/);
    assert.match(groupManager, /GroupNameEditor/);
  });

  it("gives the thread menu bb's full set on both surfaces", () => {
    // bb's own thread menu offers open-in-split, copy link, read, pin, rename,
    // archive, and delete. The id copy is additive; the rest must be present.
    for (const label of [
      "Open in split",
      "Copy thread link",
      "Copy thread ID",
      "Rename…",
      "Archive",
      "Delete…",
    ]) {
      assert.match(threadMenu, new RegExp(`label: "${label}"`), label);
    }
    assert.match(threadMenu, /Mark read/);
    assert.match(threadMenu, /Unpin/);
    // One description, two surfaces: the dropdown and the right-click menu.
    assert.match(card, /<RowContextMenu/);
    assert.match(contextMenu, /useThreadMenuActions/);
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

  it("keeps the provider at the trailing edge and inserts actions in flow", () => {
    assert.match(card, /data-nest-root-metadata=""[\s\S]*className="flex h-4/);
    assert.doesNotMatch(card, /ROW_MENU_OVERLAY_CLASS/);
    assert.match(card, /showRootRail \? \(/);
    assert.match(card, /function ChildThreadRow[\s\S]*useRowReveal()/);
  });

  it("renders icon previews directly instead of blank deferred placeholders", () => {
    assert.match(groupManager, /<IconPicker/);
    assert.doesNotMatch(groupManager, /GroupIcon name=\{icon\} className="size-4" ariaHidden defer/);
    assert.match(groupManager, /<PopoverContent/);
    assert.ok(groupManager.includes('aria-label={label + " picker"}'));
  });
});
