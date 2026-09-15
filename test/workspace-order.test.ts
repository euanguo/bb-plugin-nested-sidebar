import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  keyboardWorkspaceMove,
  moveProjectWorkspace,
  orderWorkspaces,
} from "../lib/workspace-order.ts";
import type { WorkspaceRef } from "../lib/workspace.ts";

const ref = (
  key: string,
  kind: WorkspaceRef["kind"],
  label: string,
): WorkspaceRef => ({
  kind,
  key,
  label,
  alias: null,
  branch: kind === "worktree" ? label : null,
  environmentId: key,
});

const checkout = ref("env_checkout", "main", "feat/ultimate-version");
const alpha = ref("env_alpha", "worktree", "alpha");
const beta = ref("env_beta", "worktree", "beta");
const gamma = ref("env_gamma", "worktree", "gamma");

const keysOf = (workspaces: readonly { ref: WorkspaceRef }[]) =>
  workspaces.map((workspace) => workspace.ref.key);

/** The rows a project draws, as the tree hands them over: refs in a list. */
const rows = (...refs: readonly WorkspaceRef[]) => refs.map((ref) => ({ ref }));

describe("moveProjectWorkspace", () => {
  const keys = ["env_alpha", "env_beta", "env_gamma"];

  it("drops a worktree before or after the row it landed on", () => {
    const before = moveProjectWorkspace({
      projectId: "proj",
      sourceProjectId: "proj",
      targetProjectId: "proj",
      keys,
      sourceKey: "env_gamma",
      targetKey: "env_alpha",
      position: "before",
    });
    assert.deepEqual(before, { ok: true, keys: ["env_gamma", "env_alpha", "env_beta"] });

    const after = moveProjectWorkspace({
      projectId: "proj",
      sourceProjectId: "proj",
      targetProjectId: "proj",
      keys,
      sourceKey: "env_alpha",
      targetKey: "env_gamma",
      position: "after",
    });
    assert.deepEqual(after, { ok: true, keys: ["env_beta", "env_gamma", "env_alpha"] });
  });

  it("refuses a move between two projects", () => {
    assert.deepEqual(
      moveProjectWorkspace({
        projectId: "proj",
        sourceProjectId: "other",
        targetProjectId: "proj",
        keys,
        sourceKey: "env_alpha",
        targetKey: "env_beta",
        position: "before",
      }),
      { ok: false, reason: "cross-project" },
    );
  });

  it("refuses a row dropped on itself, or on one it cannot see", () => {
    const same = moveProjectWorkspace({
      projectId: "proj",
      sourceProjectId: "proj",
      targetProjectId: "proj",
      keys,
      sourceKey: "env_alpha",
      targetKey: "env_alpha",
      position: "after",
    });
    assert.equal(same.ok, false);

    const missing = moveProjectWorkspace({
      projectId: "proj",
      sourceProjectId: "proj",
      targetProjectId: "proj",
      keys,
      sourceKey: "env_alpha",
      targetKey: "env_nowhere",
      position: "after",
    });
    assert.deepEqual(missing, { ok: false, reason: "missing-workspace" });
  });

  it("refuses a list that is not a permutation of valid keys", () => {
    const duplicated = moveProjectWorkspace({
      projectId: "proj",
      sourceProjectId: "proj",
      targetProjectId: "proj",
      keys: ["env_alpha", "env_alpha"],
      sourceKey: "env_alpha",
      targetKey: "env_beta",
      position: "after",
    });
    assert.deepEqual(duplicated, { ok: false, reason: "invalid-id" });
  });
});

describe("keyboardWorkspaceMove", () => {
  const keys = ["env_alpha", "env_beta", "env_gamma"];

  it("steps one row, in both directions", () => {
    const up = keyboardWorkspaceMove("proj", keys, "env_beta", -1);
    assert.deepEqual(up, { ok: true, keys: ["env_beta", "env_alpha", "env_gamma"] });
    const down = keyboardWorkspaceMove("proj", keys, "env_beta", 1);
    assert.deepEqual(down, { ok: true, keys: ["env_alpha", "env_gamma", "env_beta"] });
  });

  it("stops at the ends rather than wrapping", () => {
    assert.deepEqual(keyboardWorkspaceMove("proj", keys, "env_alpha", -1), {
      ok: false,
      reason: "missing-workspace",
    });
    assert.deepEqual(keyboardWorkspaceMove("proj", keys, "env_gamma", 1), {
      ok: false,
      reason: "missing-workspace",
    });
  });
});

describe("orderWorkspaces", () => {
  it("leads with the checkout whatever the stored order says", () => {
    const ordered = orderWorkspaces(
      rows(alpha, beta, checkout),
      ["env_beta", "env_alpha", "env_checkout"],
    );
    assert.deepEqual(keysOf(ordered), [
      "env_checkout",
      "env_beta",
      "env_alpha",
    ]);
  });

  it("keeps the stored arrangement for the worktrees", () => {
    const ordered = orderWorkspaces(
      rows(alpha, beta, gamma, checkout),
      ["env_gamma", "env_alpha", "env_beta"],
    );
    assert.deepEqual(keysOf(ordered), [
      "env_checkout",
      "env_gamma",
      "env_alpha",
      "env_beta",
    ]);
  });

  it("puts a worktree nobody arranged after the ones that were", () => {
    // A worktree created since, on this machine or another one, lands by label
    // at the end rather than at the top of an arrangement it was never in.
    const ordered = orderWorkspaces(rows(alpha, beta, gamma, checkout), [
      "env_beta",
    ]);
    assert.deepEqual(keysOf(ordered), [
      "env_checkout",
      "env_beta",
      "env_alpha",
      "env_gamma",
    ]);
  });

  it("falls back to labels when there is no arrangement at all", () => {
    assert.deepEqual(
      keysOf(orderWorkspaces(rows(beta, gamma, alpha, checkout), undefined)), [
        "env_checkout",
        "env_alpha",
        "env_beta",
        "env_gamma",
      ],
    );
    // A stored list that is not a valid order is no order.
    assert.deepEqual(
      keysOf(
        orderWorkspaces(rows(beta, alpha, checkout), ["env_beta", "env_beta"]),
      ),
      ["env_checkout", "env_alpha", "env_beta"],
    );
  });
});
