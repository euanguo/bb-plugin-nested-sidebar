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
const menu = await readFile(
  new URL("../components/ui/menu.tsx", import.meta.url),
  "utf8",
);
const hoverCard = await readFile(
  new URL("../components/ui/hover-card.tsx", import.meta.url),
  "utf8",
);
const select = await readFile(
  new URL("../components/ui/select.tsx", import.meta.url),
  "utf8",
);
const portalScope = await readFile(
  new URL("../lib/portal-scope.ts", import.meta.url),
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

  it("discards an orphaned dialog instead of leaving it on screen", () => {
    // A dialog that was shown, then detached without close(), stays open and
    // leaves the top layer — visible, backdrop-less, and deaf to Escape. The
    // sweep is what stops one from outliving the bundle that made it.
    assert.match(modal, /dialog\[data-nest-modal\]/);
    assert.match(modal, /function discardOrphanDialogs/);
    assert.match(modal, /if \(dialog === keep\) continue;/);
    assert.match(modal, /dialog\.remove\(\)/);
  });

  it("portals floating surfaces into an open dialog, not past it", () => {
    // A native modal paints in the top layer, so a body-portaled popover cannot
    // appear above it at any z-index. Overlays therefore move into the dialog
    // while one is open, and stay on the body otherwise.
    assert.match(portalScope, /dialog\[data-nest-modal\]\[open\]/);
    assert.match(portalScope, /export function useOverlayPortalContainer/);
    assert.match(portalScope, /useLayoutEffect/);
    for (const source of [menu, hoverCard]) {
      assert.match(source, /container=\{container\}/);
    }
    assert.match(select, /container=\{useOverlayPortalContainer\(\)\}/);
  });
});
