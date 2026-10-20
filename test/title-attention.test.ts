import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk";
import {
  titleAttentionEntries,
  titleAttentionWindow,
  type TitleAttentionEntry,
} from "../lib/title-attention.ts";
import { automaticProjectColor } from "../lib/project-colors.ts";

const app = await readFile(new URL("../app.tsx", import.meta.url), "utf8");
const component = await readFile(
  new URL("../components/title-attention.tsx", import.meta.url),
  "utf8",
);
const layout = await readFile(
  new URL("../hooks/use-title-bar-band.ts", import.meta.url),
  "utf8",
);

const NOW = 1_000_000;

function thread(
  id: string,
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id,
    projectId: "p1",
    title: id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: NOW - 60_000,
    lastReadAt: null,
    latestAttentionAt: NOW - 60_000,
    ...overrides,
  };
}

const projects: readonly PluginSidebarProject[] = [
  { id: "p1", name: "One", isPersonal: false },
  { id: "p2", name: "Two", isPersonal: false },
];

function entries(
  threads: readonly PluginSidebarThread[],
  isActive: (thread: PluginSidebarThread) => boolean = () => true,
  projectColors: ReadonlyMap<string, string> = new Map(),
): TitleAttentionEntry[] {
  return titleAttentionEntries({
    threads,
    projects,
    projectColors,
    now: NOW,
    isActive,
  });
}

describe("titleAttentionEntries", () => {
  it("keeps every attention state and drops the quiet ones", () => {
    const result = entries([
      thread("failed", { indicator: "unread-error" }),
      thread("needs", { hasPendingInteraction: true }),
      thread("working", { indicator: "runtime" }),
      thread("unread", { isUnread: true }),
      thread("quiet"),
      thread("stale", { updatedAt: 0, latestAttentionAt: 0 }),
    ]);
    assert.deepEqual(
      result.map((entry) => entry.family.root.id),
      ["failed", "needs", "working", "unread"],
    );
    assert.deepEqual(
      result.map((entry) => entry.status.kind),
      ["failed", "needs-you", "working", "unread"],
    );
  });

  it("orders equal states by the family's latest activity", () => {
    const result = entries([
      thread("older", { indicator: "runtime", updatedAt: NOW - 20_000 }),
      thread("newer", { indicator: "runtime", updatedAt: NOW - 1_000 }),
    ]);
    assert.deepEqual(
      result.map((entry) => entry.family.root.id),
      ["newer", "older"],
    );
  });

  it("rolls a child's state up and points the click at the child", () => {
    const result = entries([
      thread("root"),
      thread("child", {
        parentThreadId: "root",
        hasPendingInteraction: true,
      }),
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.status.kind, "needs-you");
    assert.equal(result[0]?.leadThreadId, "child");
  });

  it("uses the lifecycle shelf decision instead of showing snoozed work", () => {
    const result = entries(
      [
        thread("snoozed", { isUnread: true }),
        thread("active", { isUnread: true }),
      ],
      (thread) => thread.id !== "snoozed",
    );
    assert.deepEqual(
      result.map((entry) => entry.family.root.id),
      ["active"],
    );
  });

  it("uses the configured project colour, then its automatic one", () => {
    const result = entries(
      [
        thread("a", { isUnread: true }),
        thread("b", { projectId: "p2", isUnread: true }),
      ],
      () => true,
      new Map([["p1", "#123456"]]),
    );
    assert.deepEqual(
      result.map((entry) => entry.color),
      ["#123456", automaticProjectColor("p2")],
    );
  });

  it("keeps the most urgent prefix when the title bar is short", () => {
    const result = entries(
      Array.from({ length: 10 }, (_, index) =>
        thread(`working-${index}`, {
          indicator: "runtime",
          updatedAt: NOW - index * 1_000,
        }),
      ),
    );
    const window = titleAttentionWindow(result, 300);
    assert.equal(window.visible.length, 3);
    assert.equal(window.hidden.length, 7);
    assert.equal(window.visible[0]?.family.root.id, "working-0");
  });
});

describe("the title-bar attention surface", () => {
  it("is registered as an app overlay", () => {
    assert.match(app, /app\.slots\.experimental_appOverlay\(\{/);
    assert.match(app, /id: "title-attention"/);
    assert.match(app, /component: TitleAttention/);
  });

  it("reads state and opens the lead thread, without pinning", () => {
    assert.match(component, /useThreadShelves\(\)/);
    assert.match(component, /actions\.open\(entry\.leadThreadId\)/);
    assert.doesNotMatch(component, /usePinnedOrder|isPinned|setPinned/);
    assert.match(component, /nestPreferenceStyle\(preferences\)/);
  });

  it("measures the title bar instead of guessing a position", () => {
    assert.match(layout, /app-window-title-bar/);
    assert.match(layout, /data-bb-plugin-app-overlays/);
    assert.match(layout, /data-nest-title-attention/);
    assert.match(layout, /ResizeObserver/);
    // The strip is the containing band: a plugin control's own vertical offset
    // must not move the chips away from the title bar's centre.
    assert.match(layout, /top: Math\.round\(rect\.top\)/);
    assert.doesNotMatch(layout, /middle = box\.top/);
  });
});
