import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  rollupCounts,
  rollupSummary,
  type StatusRollup,
} from "../lib/rollup.ts";

const badge = await readFile(
  new URL("../components/inbox/rollup-badge.tsx", import.meta.url),
  "utf8",
);
const metadata = await readFile(
  new URL("../components/inbox/row-metadata.tsx", import.meta.url),
  "utf8",
);
const card = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);

function rollup(overrides: Partial<StatusRollup> = {}): StatusRollup {
  return {
    kind: "working",
    total: 1,
    failed: 0,
    working: 1,
    needsYou: 0,
    unread: 0,
    leadThreadId: "thr_1",
    ...overrides,
  };
}

describe("rollupCounts", () => {
  /**
   * The order is the whole point of a rollup: a folded row is skimmed, and a
   * blocked thread is the one that must not hide behind a running one.
   */
  it("orders by urgency, not by count", () => {
    const counts = rollupCounts(
      rollup({ failed: 1, needsYou: 1, working: 9, unread: 1 }),
    );
    assert.deepEqual(
      counts.map((entry) => entry.kind),
      ["failed", "needs-you", "working", "unread"],
    );
  });

  it("leaves out every signal that is zero", () => {
    assert.deepEqual(rollupCounts(rollup({ working: 3 })), [
      { kind: "working", count: 3 },
    ]);
  });

  it("returns nothing for a quiet subtree", () => {
    assert.deepEqual(
      rollupCounts(rollup({ kind: "inactive", working: 0, total: 4 })),
      [],
    );
  });

  /**
   * One list, two renderings. The dots a row draws and the sentence a screen
   * reader reads come from the same call, so they cannot disagree about which
   * signal came first.
   */
  it("is the same list rollupSummary words", () => {
    const counts = rollup({ failed: 2, needsYou: 1, working: 3 });
    assert.equal(rollupSummary(counts), "2 failed · 1 needs you · 3 working");
    assert.equal(
      rollupSummary(counts),
      rollupCounts(counts)
        .map((entry) => `${entry.count} ${entry.kind.replace("-", " ")}`)
        .join(" · "),
    );
  });

  it("still says nothing for a rollup with no counts", () => {
    assert.equal(rollupSummary(rollup({ kind: "inactive", working: 0 })), "");
  });
});

/**
 * The badge used to be a single dot, on the argument that a narrow navigation
 * surface has no room for counts. That argument was wrong in the one place it
 * mattered — two working threads and one waiting on you are the same dot and
 * very different mornings — so the badge now draws the breakdown the README had
 * been promising all along.
 */
describe("RollupBadge", () => {
  it("draws one dot and one count per signal", () => {
    assert.match(badge, /rollupCounts\(rollup\)/);
    assert.match(badge, /counts\.map\(\(entry\) =>/);
    assert.match(badge, /<StatusDot status=\{familyStatusPresentation\(entry\.kind\)\} \/>/);
    assert.match(badge, /<span className="tabular-nums">\{entry\.count\}<\/span>/);
  });

  it("still draws nothing for a quiet subtree", () => {
    assert.match(
      badge,
      /rollup\.total === 0 \|\|\s*rollup\.kind === "inactive" \|\|\s*rollup\.kind === "stale"/,
    );
  });

  // Nothing here is only a colour: the wording is on the title and the label.
  it("keeps the wording on the title and the accessible label", () => {
    assert.match(badge, /title=\{label\}/);
    assert.match(badge, /<span className="sr-only">\{label\}<\/span>/);
  });

  /**
   * Found in the running app: a folded row was read out as "Working · 1
   * working", because the title prefixed the dominant state's label to a summary
   * whose first entry already named it. The summary is complete on its own — its
   * first entry *is* the dominant state, in priority order — so the label
   * survives only as the fallback for a rollup with no counts to name.
   */
  it("does not say the dominant state twice", () => {
    assert.match(
      badge,
      /const label = summary === "" \? presentation\.label : summary;/,
    );
    assert.doesNotMatch(badge, /title=\{`\$\{presentation\.label\}/);
  });
});

/**
 * Subagents and child threads are different things, and bb's own documentation
 * says so: a fork is a child thread, a subagent spawned inside a turn is
 * `activity.backgroundAgents` on its parent. One merged number would tell the
 * user a thread has four children when it has one child and three helpers.
 */
describe("SubagentBadge", () => {
  it("counts subagents, not children", () => {
    assert.match(metadata, /export function SubagentBadge/);
    assert.match(metadata, /`\$\{count\} subagent\$\{count === 1 \? "" : "s"\} running`/);
  });

  it("is drawn on the root row, apart from the child disclosure", () => {
    const subagent = card.indexOf("<SubagentBadge");
    // The child disclosure is the button that controls the child list; the
    // subagent badge is a plain count before it, so the two cannot be read as
    // one figure.
    const disclosure = card.indexOf("aria-controls={childListId}");
    assert.ok(subagent >= 0, "the badge is rendered");
    assert.ok(disclosure >= 0, "the child disclosure is still the button");
    assert.ok(
      subagent < disclosure,
      "the subagent count is not the child disclosure",
    );
    assert.match(card, /<SubagentBadge count=\{thread\.activity\.backgroundAgents\} \/>/);
  });

  it("makes the row's metadata rail appear for a subagent count alone", () => {
    assert.match(
      card,
      /thread\.activity\.backgroundAgents > 0 \|\|\s*\(preferences\.showPullRequestMetadata/,
    );
  });

  // The chip that used to carry this was never registered anywhere — a leftover
  // from the fork, kept alive only by its own file.
  it("leaves no dead subagent chip behind", async () => {
    const entries = await readdir(
      new URL("../components/inbox/", import.meta.url),
    );
    assert.ok(!entries.includes("subagents-chip.tsx"));
  });
});