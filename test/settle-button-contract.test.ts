import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const card = await readFile(
  new URL("../components/inbox/thread-card.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../components/inbox/settle-button.css", import.meta.url),
  "utf8",
);

/** The stylesheet without its header comment, which names the upstream repo. */
const rules = css.slice(css.indexOf("*/") + 2);

/** Each `<ParkButton … />` in the card, so the two uses can be compared. */
function parkButtons(): string[] {
  const tags: string[] = [];
  let at = card.indexOf("<ParkButton");
  while (at !== -1) {
    const end = card.indexOf("/>", at);
    tags.push(card.slice(at, end));
    at = card.indexOf("<ParkButton", end);
  }
  return tags;
}

describe("the settle button's sparkle", () => {
  it("ships its own stylesheet with the component that draws it", () => {
    assert.match(card, /import "\.\/settle-button\.css";/);
  });

  it("renames every upstream name, class and keyframe alike", () => {
    assert.match(rules, /@keyframes nest-settle-sparkle/);
    assert.match(rules, /\.nest-settle-sparkle \{/);
    assert.match(
      rules,
      /\.nest-settle:is\(:hover, :focus-visible\) \.nest-settle-sparkle \{/,
    );
    // Both plugins can be installed at once and this stylesheet is global, so
    // no upstream selector or keyframe name may survive.
    assert.doesNotMatch(rules, /bb-sidebar/);
    assert.doesNotMatch(card, /bb-sidebar-settle/);
  });

  it("keeps the motion behind a reduced-motion gate, and the sparkles visible", () => {
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{/);
    // Outside the gate, so a reduced-motion user still sees the stars.
    assert.match(
      css,
      /\.nest-settle:is\(:hover, :focus-visible\) \.nest-settle-sparkle \{\n  opacity: 0\.85;\n\}/,
    );
    assert.match(
      css,
      /animation: nest-settle-sparkle 750ms var\(--sparkle-delay\) ease-out both;/,
    );
  });

  it("draws five sparkles", () => {
    assert.match(card, /\[0, 1, 2, 3, 4\]\.map\(\(sparkle\) => \(/);
    assert.match(card, /className="nest-settle-sparkle"/);
    for (const index of [1, 2, 3, 4, 5]) {
      assert.match(
        css,
        new RegExp(`\\.nest-settle-sparkle:nth-of-type\\(${index}\\)`),
      );
    }
  });

  it("celebrates the settle, not the snooze", () => {
    const [snooze, settle] = parkButtons();
    assert.notEqual(snooze, undefined);
    assert.notEqual(settle, undefined);
    assert.doesNotMatch(snooze!, /sparkle/);
    assert.match(settle!, /sparkle/);
    assert.match(settle!, /icon="Archive"/);
  });

  it("moves the artwork, not the hit area", () => {
    // The outer button carries no transform; the inner span carries the lift.
    assert.match(card, /motion-safe:group-hover\/settle:-translate-y-0\.5/);
    assert.match(card, /motion-safe:group-active\/settle:scale-90/);
    assert.match(card, /motion-safe:group-hover\/settle:rotate-\[-8deg\]/);
  });
});

describe("the sidebar's motion discipline", () => {
  const tier1: Array<[string, string]> = [
    ["../components/inbox/thread-card.tsx", "transition-colors duration-150 ease-out motion-reduce:transition-none"],
    ["../components/inbox/slim-row.tsx", "transition-opacity duration-150 ease-out motion-reduce:transition-none"],
    ["../components/inbox/row-actions.tsx", "transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none"],
    ["../components/inbox/row-actions.tsx", "text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none"],
  ];

  for (const [relative, expected] of tier1) {
    it(`${relative} carries "${expected.slice(0, 24)}…"`, async () => {
      const source = await readFile(new URL(relative, import.meta.url), "utf8");
      assert.ok(
        source.includes(expected),
        `missing in ${relative}: ${expected}`,
      );
    });
  }

  it("stops the spinner and the shine for a reduced-motion user", async () => {
    const glyph = await readFile(
      new URL("../components/inbox/status-glyph.tsx", import.meta.url),
      "utf8",
    );
    const family = await readFile(
      new URL("../components/inbox/family-status.tsx", import.meta.url),
      "utf8",
    );
    assert.match(glyph, /"animate-spin motion-reduce:animate-none"/);
    assert.match(glyph, /"animate-shine-icon motion-reduce:animate-none"/);
    assert.match(family, /"animate-spin motion-reduce:animate-none"/);
    assert.match(family, /"animate-pulse motion-reduce:animate-none"/);
  });
});
