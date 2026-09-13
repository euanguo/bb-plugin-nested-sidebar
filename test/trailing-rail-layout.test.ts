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

  it("uses one shared overlay placement for hover-only row menus", () => {
    assert.match(rowActions, /ROW_MENU_OVERLAY_CLASS/);
    assert.match(threadCard, /ROW_MENU_OVERLAY_CLASS/);
  });
});
