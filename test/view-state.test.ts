import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_SCOPE_KEY,
  UNGROUPED_SCOPE_KEY,
  VIEW_STATE_STORAGE_KEY,
  decodeViewState,
  defaultViewState,
  readViewState,
  resolveGroupScope,
  withId,
  writeViewState,
  type ViewStateStorage,
} from "../lib/view-state.ts";

function storage(initial: string | null): ViewStateStorage & {
  value: string | null;
} {
  const holder = {
    value: initial,
    getItem() {
      return holder.value;
    },
    setItem(_key: string, next: string) {
      holder.value = next;
    },
  };
  return holder;
}

describe("view state persistence", () => {
  it("falls back to the default view for missing or corrupt storage", () => {
    assert.deepEqual(decodeViewState(null), defaultViewState());
    assert.deepEqual(decodeViewState("not json"), defaultViewState());
    assert.deepEqual(decodeViewState('{"version":2}'), defaultViewState());
    assert.deepEqual(
      decodeViewState('{"version":1,"collapsedProjects":"nope"}'),
      defaultViewState(),
    );
  });

  it("round-trips the whole view through storage", () => {
    const store = storage(null);
    const written = {
      ...defaultViewState(),
      scope: "grp_a",
      filter: "working" as const,
      collapsedGroups: [UNGROUPED_SCOPE_KEY],
      collapsedProjects: ["proj_1"],
      expandedWorkspaces: ["env_1"],
      expandedFamilies: ["thr_1"],
      snoozedOpen: true,
    };
    assert.equal(writeViewState(written, store), true);
    assert.equal(store.value !== null, true);
    assert.deepEqual(readViewState(store), written);
    assert.equal(
      store.value !== null && store.value.includes("version"),
      true,
    );
  });

  it("uses one key so a partial write cannot mix two sessions", () => {
    const store = storage(null);
    writeViewState({ ...defaultViewState(), scope: "grp_b" }, store);
    assert.equal(typeof VIEW_STATE_STORAGE_KEY, "string");
    assert.deepEqual(readViewState(store).collapsedProjects, []);
  });

  it("lets a collapse win over a contradictory expansion", () => {
    const decoded = decodeViewState(
      JSON.stringify({
        version: 1,
        expandedFamilies: ["thr_1", "thr_2"],
        collapsedFamilies: ["thr_1"],
      }),
    );
    assert.deepEqual(decoded.collapsedFamilies, ["thr_1"]);
    assert.deepEqual(decoded.expandedFamilies, ["thr_2"]);
  });

  it("ignores an unknown filter rather than dropping the whole record", () => {
    const decoded = decodeViewState(
      JSON.stringify({ version: 1, filter: "bogus", collapsedProjects: ["p"] }),
    );
    assert.equal(decoded.filter, "all");
    assert.deepEqual(decoded.collapsedProjects, ["p"]);
  });
});

describe("withId", () => {
  it("adds and removes without disturbing the rest of the order", () => {
    assert.deepEqual(withId(["a", "b"], "c", true), ["a", "b", "c"]);
    assert.deepEqual(withId(["a", "b", "c"], "b", false), ["a", "c"]);
  });

  it("is a no-op when the list already agrees", () => {
    const ids = ["a", "b"];
    assert.deepEqual(withId(ids, "a", true), ids);
    assert.deepEqual(withId(ids, "z", false), ids);
  });

  it("rejects an unusable id", () => {
    assert.deepEqual(withId(["a"], "", true), ["a"]);
    assert.deepEqual(withId(["a"], "bad\u0000id", true), ["a"]);
  });
});

describe("resolveGroupScope", () => {
  const groups = new Set(["grp_a"]);

  it("restores a stored group the user still has", () => {
    assert.deepEqual(resolveGroupScope("grp_a", groups), {
      kind: "group",
      groupId: "grp_a",
    });
  });

  it("degrades a deleted group to All rather than an empty tree", () => {
    assert.deepEqual(resolveGroupScope("grp_gone", groups), { kind: "all" });
  });

  it("treats All and Ungrouped as their own destinations", () => {
    assert.deepEqual(resolveGroupScope(ALL_SCOPE_KEY, groups), { kind: "all" });
    assert.deepEqual(resolveGroupScope(UNGROUPED_SCOPE_KEY, groups), {
      kind: "ungrouped",
    });
  });
});
