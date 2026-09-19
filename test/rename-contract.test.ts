import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const inbox = (relative: string) =>
  readFile(new URL(`../components/inbox/${relative}`, import.meta.url), "utf8");

const field = await inbox("rename-field.tsx");
const card = await inbox("thread-card.tsx");
const slimRow = await inbox("slim-row.tsx");
const treeRows = await inbox("tree-rows.tsx");
const menuItems = await inbox("thread-menu-items.tsx");
const contextMenu = await inbox("row-context-menu.tsx");
const clipboard = await readFile(
  new URL("../lib/clipboard.ts", import.meta.url),
  "utf8",
);

/**
 * Renaming happens in the row, at every level that has one.
 *
 * The field has to replace the title it is renaming, so the row owns it and the
 * menu only asks for it. That split is what lets one field serve a thread, a
 * child thread, a parked thread, and a worktree alias without four editors
 * drifting apart.
 */
describe("inline rename", () => {
  it("has no rename dialog left, and nothing that references one", async () => {
    const entries = await readdir(new URL("../components/inbox/", import.meta.url));
    assert.ok(!entries.includes("thread-rename-dialog.tsx"));
    for (const source of [card, slimRow, menuItems, contextMenu]) {
      assert.doesNotMatch(source, /ThreadRenameDialog|thread-rename-dialog/);
    }
  });

  it("renders one shared field at every level that renames in place", () => {
    assert.match(card, /<RenameField/);
    assert.match(slimRow, /<RenameField/);
    assert.match(treeRows, /<RenameField/);
    // The worktree's own editor is gone: it was the same rules, written twice.
    assert.doesNotMatch(treeRows, /WorkspaceNameField/);
  });

  it("leaves the field to the row and the request to the menu", () => {
    // The menu cannot draw inside the row it was opened from, so it hands the
    // decision back rather than owning a dialog.
    assert.match(menuItems, /onSelect: onRename/);
    assert.match(menuItems, /return \{ items \}/);
    // No dialog property and no dialog component — the word itself still
    // appears, in the comment explaining why the label lost its ellipsis.
    assert.doesNotMatch(menuItems, /dialog:/);
    assert.doesNotMatch(menuItems, /ThreadRenameDialog/);
    assert.match(contextMenu, /onRename,/);
    assert.doesNotMatch(contextMenu, /\{dialog\}/);
    // Both thread surfaces take the request, on both the root row and a child:
    // the dropdown and the right-click menu have to offer the same thing.
    assert.equal(
      (card.match(/onRename=\{\(\) => setRenaming\(true\)\}/g) ?? []).length,
      4,
    );
  });

  /**
   * The rules every inline editor has, and the two that are specific to this
   * one. A cancel-on-blur would discard a rename the user had finished typing;
   * the `done` latch stops the blur of an unmounting input from committing a
   * second time after Enter.
   */
  it("commits on Enter and on blur, cancels on Escape, and commits once", () => {
    assert.match(field, /if \(event\.key === "Enter"\)[\s\S]*?finish\(true\)/);
    assert.match(field, /event\.key === "Escape"[\s\S]*?finish\(false\)/);
    assert.match(field, /if \(!heldFocus\.current\) return;\s*finish\(true\)/);
    assert.match(field, /if \(done\) return;\s*setDone\(true\)/);
  });

  /**
   * Found in the running app: the field rendered with the right label and value
   * and was **not** focused, so the user had to click the thing they had just
   * asked for. `autoFocus` loses a race that is always lost here — the field
   * mounts inside a menu that is closing, and Radix restores focus to the menu
   * trigger *after* the field mounts.
   */
  it("takes the focus after the menu has given it back", () => {
    assert.match(field, /requestAnimationFrame\(takeFocus\)/);
    assert.match(field, /if \(document\.activeElement !== node\) \{\s*node\.focus\(\);/);
    assert.match(field, /node\.select\(\)/);
    // `autoFocus` is gone as a prop rather than left in beside the effect: it
    // reads as the mechanism while doing nothing, which is how the race stayed
    // hidden. The word still appears in the prose above, so this matches the
    // attribute and not the word.
    assert.doesNotMatch(field, /^\s+autoFocus\s*$/m);
  });

  /**
   * The second half of the same race, and the one the first fix got wrong.
   *
   * Grabbing focus once was not enough: Radix gave it back a frame later, the
   * blur fired, and commit-on-blur unmounted the field before the user could type
   * in it. So the field insists for a bounded window, and a blur that arrives
   * before it has ever held focus is ignored rather than treated as leaving.
   */
  it("insists for a bounded window, and ignores a blur before it holds focus", () => {
    assert.match(field, /performance\.now\(\) - startedAt < 200/);
    assert.match(field, /heldFocus\.current = document\.activeElement === node;/);
    assert.match(field, /const heldFocus = useRef\(false\)/);
  });

  // The caller's ref and the internal one are one node: a callback ref serves
  // both, so a row that remounts the field still gets it back.
  it("gives the node to the caller's ref and its own", () => {
    assert.match(field, /const setRef = \(node: HTMLInputElement \| null\) => \{/);
    assert.match(field, /if \(inputRef !== undefined\) inputRef\.current = node;/);
    assert.match(field, /ref=\{setRef\}/);
  });

  /**
   * Found in the running app: DevTools reported this field — and only this field
   * — as a form control with no `id` or `name`. `aria-label` names it for a
   * screen reader, which is not the same thing. `useId` rather than a constant,
   * because several rows can have a field mounted at once.
   */
  it("identifies itself as a form control", () => {
    assert.match(field, /const fieldId = useId\(\)/);
    assert.match(field, /id=\{fieldId\}/);
    assert.match(field, /name="nest-name"/);
  });

  // An empty draft is not a rename. The field hands the raw draft over and the
  // caller's own intent rule decides, so "cleared the field" cannot become
  // "rename it to nothing".
  it("defers the empty-draft rule to the caller", () => {
    assert.match(field, /onCommit: \(draft: string\) => void/);
    assert.doesNotMatch(field, /trim\(\)/);
    for (const source of [card, slimRow]) {
      assert.match(source, /renameIntent\(draft, /);
    }
  });

  /**
   * The row's title sits in a `pointer-events-none` container so the full-bleed
   * anchor underneath receives the press that opens the thread. The field has to
   * opt back in, or it would render and never take focus.
   */
  it("opts back into pointer events, and stops them reaching the anchor", () => {
    assert.match(field, /pointer-events-auto/);
    assert.match(field, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
    assert.match(field, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  });

  /**
   * A refusal has nowhere to be shown: by the time it arrives the field is gone
   * and the title on screen is the one the store still holds. The row is already
   * telling the truth, so the only thing left is to say the write did not land.
   */
  it("announces a rename the host refused", () => {
    for (const source of [card, slimRow]) {
      assert.match(source, /announceToSidebar\("The thread could not be renamed"\)/);
    }
    // Through the sidebar's live region, not a row-local error line.
    assert.match(clipboard, /export function announceToSidebar/);
  });
});