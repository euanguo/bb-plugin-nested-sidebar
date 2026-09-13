import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const modal = await readFile(new URL("../components/ui/modal.tsx", import.meta.url), "utf8");
const inbox = await readFile(new URL("../components/inbox/thread-inbox.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../components/ui/menu.tsx", import.meta.url), "utf8");
const hoverCard = await readFile(new URL("../components/ui/hover-card.tsx", import.meta.url), "utf8");
const select = await readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8");
const groupManager = await readFile(new URL("../components/inbox/group-manager-dialog.tsx", import.meta.url), "utf8");
const portalScope = await readFile(new URL("../lib/portal-scope.ts", import.meta.url), "utf8");

describe("modal and overlay contracts", () => {
  it("routes row new-thread actions through the host composer", () => {
    assert.match(inbox, /sidebarActions\.openNewThread/);
    assert.doesNotMatch(inbox, /<NewThreadDialog/);
  });

  it("uses the official BB dialog instead of a native dialog", () => {
    assert.match(modal, /from "@\/components\/ui\/dialog"/);
    assert.match(modal, /<Dialog[\s\S]*<DialogContent/);
    assert.match(modal, /aria-label="Close"/);
    assert.doesNotMatch(modal, /<dialog/);
    assert.doesNotMatch(modal, /showModal\(\)/);
  });

  it("keeps floating surfaces in the official portal path", () => {
    assert.match(groupManager, /from "@\/components\/ui\/popover"/);
    assert.doesNotMatch(groupManager, /@radix-ui\/react-popover/);
    assert.doesNotMatch(groupManager, /useOverlayPortalContainer/);
    assert.doesNotMatch(groupManager, /Popover\.Portal/);
    assert.match(menu, /container=\{container\}/);
    assert.match(hoverCard, /container=\{container\}/);
    assert.match(select, /container=\{useOverlayPortalContainer\(\)\}/);
    assert.match(portalScope, /data-bb-portaled-overlay/);
  });
});
