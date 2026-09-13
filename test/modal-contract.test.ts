import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const modal = await readFile(new URL("../components/ui/modal.tsx", import.meta.url), "utf8");
const inbox = await readFile(new URL("../components/inbox/thread-inbox.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../components/ui/menu.tsx", import.meta.url), "utf8");
const hoverCard = await readFile(new URL("../components/ui/hover-card.tsx", import.meta.url), "utf8");
const select = await readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8");
const portalScope = await readFile(new URL("../lib/portal-scope.ts", import.meta.url), "utf8");

describe("modal and overlay contracts", () => {
  it("routes row new-thread actions through the host composer", () => {
    assert.match(inbox, /sidebarActions\.openNewThread/);
    assert.doesNotMatch(inbox, /<NewThreadDialog/);
  });

  it("keeps modal escape hatches and orphan cleanup", () => {
    assert.match(modal, /onCancel=\{/);
    assert.match(modal, /aria-label="Close"/);
    assert.match(modal, /function discardOrphanDialogs/);
    assert.match(modal, /dialog\.remove\(\)/);
  });

  it("keeps floating surfaces above native modals", () => {
    assert.match(portalScope, /dialog\[data-nest-modal\]/);
    assert.doesNotMatch(portalScope, /dialog\[data-nest-modal\]\[open\]/);
    assert.match(menu, /container=\{container\}/);
    assert.match(hoverCard, /container=\{container\}/);
    assert.match(select, /container=\{useOverlayPortalContainer\(\)\}/);
  });
});
