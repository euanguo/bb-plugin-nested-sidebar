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
    assert.match(newThread, /open=\{seed !== null\}/);
    assert.match(newThread, /seed === null \? null :/);
    // The dialog closes whenever the seed clears, from either path.
    assert.match(inbox, /setNewThreadSeed\(null\)/);
    assert.match(inbox, /onClose=\{\(\) => setNewThreadSeed\(null\)\}/);
  });

  it("reserves the sidebar scrollbar so the tree cannot jump sideways", () => {
    assert.match(inbox, /scrollbarGutter: "stable"/);
  });
});
