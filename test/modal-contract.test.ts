import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const modal = await readFile(
  new URL("../components/ui/modal.tsx", import.meta.url),
  "utf8",
);
const newThread = await readFile(
  new URL("../components/inbox/new-thread-dialog.tsx", import.meta.url),
  "utf8",
);
const inbox = await readFile(
  new URL("../components/inbox/thread-inbox.tsx", import.meta.url),
  "utf8",
);

describe("modal escape hatches", () => {
  it("never gates closing on content being ready", () => {
    // Escape (cancel), the close button, and a backdrop click all close.
    assert.match(modal, /onCancel=\{/);
    assert.match(modal, /onClose=\{/);
    assert.match(modal, /aria-label="Close"/);
    assert.match(modal, /onPointerUp=/);
    assert.match(modal, /event\.target === event\.currentTarget/);
    // The one exception stays narrow and never disables Escape.
    assert.match(modal, /if \(busy\) return;/);
  });

  it("only opens the new-thread dialog when a seed exists", () => {
    // No seed means no dialog element at all, so an unlabelled empty box is
    // not something the plugin can render even by accident.
    assert.match(newThread, /if \(seed === null\) return null;/);
    assert.match(newThread, /title=\{`New thread in \$\{seed\.projectName\}`\}/);
    // The dialog closes whenever the seed clears, from either path.
    assert.match(inbox, /setNewThreadSeed\(null\)/);
    assert.match(inbox, /onClose=\{\(\) => setNewThreadSeed\(null\)\}/);
  });

  it("promotes a fresh dialog every time it is opened", () => {
    // Only opening (never a stale already-open element) and mounting while
    // open are what stop a dialog from being left on screen un-dismissable.
    assert.match(modal, /if \(dialog === null \|\| !open \|\| dialog\.open\) return;/);
    assert.match(modal, /open \? \(/);
  });

  it("reserves the sidebar scrollbar so the tree cannot jump sideways", () => {
    // Padding absorbs the scrollbar instead of a stable gutter, which would
    // leave a permanent dead strip on the right when nothing is scrollable.
    assert.doesNotMatch(inbox, /scrollbarGutter/);
    assert.match(inbox, /min-h-0 flex-1 overflow-y-auto pl-1\.5 pr-3 pb-2/);
  });
});
