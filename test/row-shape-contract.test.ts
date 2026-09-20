import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (relative: string) =>
  readFile(new URL(relative, import.meta.url), "utf8");

const card = await read("../components/inbox/thread-card.tsx");
const disc = await read("../components/inbox/disc.tsx");

describe("the row shape borrowed from BB Sidebar", () => {
  it("draws the card as a tint, never as a box", () => {
    // bb's ThreadCard (`src/ThreadCard.tsx:165`) is `rounded-md px-2.5 py-2`
    // with a background that moves with hover and with being open. An outlined
    // family box on top of a row that also tints reads as two nested panels.
    assert.match(card, /rounded-md px-2\.5 transition-colors/);
    assert.doesNotMatch(card, /rounded-xl/);
    assert.match(card, /isActive \? "bg-sidebar-accent" : "hover:bg-sidebar-accent\/60"/);
  });

  it("says a child's state in words", () => {
    // bb's ChildStatusFlag (`src/ChildThreadList.tsx:519`).
    assert.match(card, /text-2xs font-semibold uppercase tracking-\[0\.08em\]/);
    assert.match(card, /familyStatusPresentation\("needs-you"\)/);
    assert.match(card, /familyStatusPresentation\("working"\)/);
  });

  it("tints from the palette rather than from a hue", () => {
    // bb hard-codes Tailwind hues. Nest's palette is the user's to choose, so
    // every tint on these rows is derived from the semantic colour instead —
    // otherwise a custom palette gets an amber row under a purple flag.
    assert.match(card, /className="shrink-0 rounded bg-current\/10 px-1\.5 py-0\.5/);
    assert.match(card, /style=\{\{ color: familyStatusColor\(status\) \}\}/);
    assert.match(card, /color-mix\(in srgb, \$\{familyStatusColor\(/);
    assert.doesNotMatch(card, /bg-amber-\d|text-amber-\d|bg-sky-\d|text-sky-\d/);
  });

  it("writes down a hue only for the two park buttons, and only their own", () => {
    // The exception to the rule above, and it is narrow: a park button's glow
    // says what the *user* just did, and the palette's roles are states, so
    // there is no role to read. Amber and sky are out because a row already
    // wears them for need-you and working — so each park act gets a hue of its
    // own that no state claims, and the two are different from each other.
    const tones = card.slice(
      card.indexOf("const PARK_TONES = {"),
      card.indexOf("function ParkButton("),
    );
    assert.match(tones, /group-hover\/settle:bg-emerald-500\/15/);
    assert.match(tones, /group-hover\/snooze:bg-violet-500\/15/);
    for (const hue of ["amber", "sky"]) {
      assert.doesNotMatch(tones, new RegExp(`bg-${hue}-`));
      assert.doesNotMatch(tones, new RegExp(`text-${hue}-`));
    }
  });

  it("gives a waiting child a ground of its own, under the open row's", () => {
    assert.match(card, /const needsYouRowTint = needsYou && !isActive && layout === null;/);
    assert.match(
      card,
      /needsYouRowTint \? \{ backgroundColor: NEEDS_YOU_ROW_TINT \} : undefined/,
    );
  });

  it("folds the children into a chip with their dots and a chevron", () => {
    // bb's ChildThreadBadge (`src/ChildThreadList.tsx:160`).
    assert.match(card, /function ChildThreadChip\(/);
    assert.match(card, /flex h-5 shrink-0 items-center gap-1 rounded-full bg-current\/10 px-1\.5/);
    assert.match(card, /<DiscCluster threads=\{threads\} compact \/>/);
    const chip = card.slice(
      card.indexOf("function ChildThreadChip("),
      card.indexOf("function NestedDisclosure("),
    );
    assert.match(chip, /<span className="tabular-nums">\{threads\.length\}<\/span>/);
    assert.match(chip, /name="ChevronDown"/);
    assert.match(chip, /expanded && "rotate-180"/);
  });

  it("nests a child's own children instead of flattening them", () => {
    // bb's ChildThreadList renders three levels: a card, its children, and a
    // per-child disclosure with the grandchildren under it
    // (`src/ChildThreadList.tsx:317,484`).
    assert.match(card, /branches\.map\(\(branch\) => \(/);
    assert.match(card, /branches=\{branch\.children\}/);
    assert.match(card, /function NestedDisclosure\(/);
    assert.match(card, /nestedExpanded && "border-l-\[1\.5px\] border-sidebar-border pl-2"/);
    // A row leading to the open thread draws its children whatever the setting
    // says — the disclosure's version of "never hold back the open thread".
    assert.match(
      card,
      /branches\.some\(\(branch\) => branchHoldsThread\(branch, activeThreadId\)\)/,
    );
  });

  it("opens a nested list from its own state, keyed by the thread", () => {
    // The same override the family uses, so the choice survives a reload and a
    // search can force both levels open.
    assert.match(card, /viewState\.familyOverride\(thread\.id\)/);
    assert.match(card, /viewState\.setFamilyOverride\(thread\.id, next\)/);
  });

  it("keeps one cluster implementation for the header and the row", () => {
    assert.match(disc, /export function DiscCluster\(/);
    assert.match(disc, /compact \? "size-2\.5" : "size-3\.5"/);
  });
});
