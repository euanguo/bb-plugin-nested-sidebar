import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (relative: string) =>
  readFile(new URL(`../${relative}`, import.meta.url), "utf8");

const rowActions = await read("components/inbox/row-actions.tsx");
const threadCard = await read("components/inbox/thread-card.tsx");
const slimRow = await read("components/inbox/slim-row.tsx");
const statusSlot = await read("components/inbox/status-slot.tsx");

describe("trailing rail layout", () => {
  it("does not reserve a generic 64px rail for optional actions", () => {
    assert.doesNotMatch(rowActions, /w-16/);
    assert.doesNotMatch(threadCard, /data-nest-root-metadata=""[\s\S]*min-w-16/);
    assert.doesNotMatch(statusSlot, /STATUS_SLOT_CLASS = "[^"]*w-16/);
    assert.doesNotMatch(slimRow, /STATUS_SLOT_CLASS/);
  });

  it("keeps hover-only menus out of the resting row flow", () => {
    assert.doesNotMatch(rowActions, /ROW_MENU_OVERLAY_CLASS/);
    assert.doesNotMatch(threadCard, /ROW_MENU_OVERLAY_CLASS/);
    assert.match(threadCard, /showRootRail \? \(/);
  });

  it("keeps stable trailing glyphs after the hover menu in one flex rail", () => {
    const metadataStart = threadCard.indexOf('data-nest-root-metadata=""');
    const rootMenuStart = threadCard.lastIndexOf("<ThreadMenu", metadataStart);
    assert.ok(metadataStart >= 0);
    assert.ok(rootMenuStart >= 0);
    assert.ok(rootMenuStart < metadataStart);
    assert.ok(
      threadCard.indexOf('name="Pin"', metadataStart) > metadataStart,
    );
    assert.ok(
      threadCard.includes(
        '"pointer-events-none relative min-w-0 flex-1",',
      ),
    );
    assert.match(threadCard, /relative z-10 flex shrink-0 items-center/);
  });
});
