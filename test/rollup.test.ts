import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeRollups,
  rollupSummary,
  rollupThreads,
  worstKind,
} from "../lib/rollup.ts";
import type { FamilyStatusThread } from "../lib/family-status.ts";
import type { RollupThread } from "../lib/rollup.ts";

const NOW = 1_700_000_000_000;

let nextId = 0;

function thread(overrides: Partial<FamilyStatusThread> = {}): RollupThread {
  return {
    id: `thr_${(nextId += 1)}`,
    indicator: "none",
    hasPendingInteraction: false,
    isUnread: false,
    updatedAt: NOW,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    ...overrides,
  };
}

describe("status rollups", () => {
  it("counts each state separately so a folded row can show numbers", () => {
    const rollup = rollupThreads(
      [
        thread({ indicator: "runtime" }),
        thread({ indicator: "runtime" }),
        thread({ hasPendingInteraction: true }),
        thread({ indicator: "unread-error" }),
        thread({ isUnread: true }),
        thread({}),
      ],
      NOW,
    );

    assert.equal(rollup.total, 6);
    // Counts overlap on purpose: an unread error is a failure AND a raised
    // hand, and both facts matter to someone scanning a folded row.
    assert.equal(rollup.failed, 1);
    assert.equal(rollup.needsYou, 2);
    assert.equal(rollup.working, 2);
    assert.equal(rollup.unread, 1);
  });

  it("puts the state that must not hide in front of the others", () => {
    assert.equal(worstKind(["working", "needs-you"]), "needs-you");
    assert.equal(worstKind(["needs-you", "failed"]), "failed");
    assert.equal(worstKind(["inactive", "stale"]), "inactive");
  });

  it("adds counts when child rollups are merged into a parent", () => {
    const left = rollupThreads([thread({ indicator: "runtime" })], NOW);
    const right = rollupThreads(
      [thread({ hasPendingInteraction: true }), thread({ isUnread: true })],
      NOW,
    );
    const merged = mergeRollups([left, right]);

    assert.equal(merged.total, 3);
    assert.equal(merged.working, 1);
    assert.equal(merged.needsYou, 1);
    assert.equal(merged.unread, 1);
    assert.equal(merged.kind, "needs-you");
  });

  it("ignores empty input rather than inventing a state", () => {
    const empty = rollupThreads([], NOW);
    assert.equal(empty.total, 0);
    assert.equal(empty.kind, "inactive");
    assert.equal(rollupSummary(empty), "");
    assert.equal(mergeRollups([empty, empty]).total, 0);
  });

  it("summarises with the most urgent count first", () => {
    const rollup = rollupThreads(
      [
        thread({ indicator: "unread-error" }),
        thread({ hasPendingInteraction: true }),
        thread({ indicator: "runtime" }),
      ],
      NOW,
    );
    assert.equal(rollupSummary(rollup), "1 failed · 2 needs you · 1 working");
  });
});
