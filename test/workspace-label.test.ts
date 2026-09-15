import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  workspaceRefOf,
  workspaceRowLabel,
  shouldShowWorkspaces,
  type WorkspaceLabelMode,
  type WorkspaceRef,
} from "../lib/workspace.ts";

/**
 * A complete DTO. The label resolution only reads the environment, but building
 * the whole shape keeps this fixture honest: a field added to the DTO surfaces
 * here as a type error rather than as a silently stale test.
 */
function thread(
  environment: PluginSidebarThread["environment"],
): PluginSidebarThread {
  return {
    id: "thr_fixture",
    projectId: "proj_fixture",
    title: "Fixture",
    titleFallback: "Fixture",
    parentThreadId: null,
    sectionId: null,
    originKind: "fork",
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
    environment,
    host: null,
    createdAt: 0,
    updatedAt: 0,
    lastReadAt: null,
    latestAttentionAt: 0,
  };
}

const worktree = (
  id: string,
  name: string | null,
  branchName: string | null,
) =>
  thread({
    id,
    name,
    branchName,
    providerId: null,
    workspaceDisplayKind: "managed-worktree",
  });

describe("workspaceRefOf labels", () => {
  it("prefers the alias as the label but keeps the branch beside it", () => {
    const ref = workspaceRefOf(worktree("env_1", "登录重构", "feature/login"));
    assert.equal(ref.label, "登录重构");
    assert.equal(ref.alias, "登录重构");
    assert.equal(ref.branch, "feature/login");
  });

  it("falls back to the branch when there is no alias", () => {
    const ref = workspaceRefOf(worktree("env_2", null, "feature/login"));
    assert.equal(ref.label, "feature/login");
    assert.equal(ref.alias, null);
    assert.equal(ref.branch, "feature/login");
  });

  it("falls back to the environment name when there is no branch", () => {
    const ref = workspaceRefOf(worktree("env_3", "scratch", null));
    assert.equal(ref.label, "scratch");
    assert.equal(ref.branch, null);
  });

  it("never leaves a worktree nameless", () => {
    const ref = workspaceRefOf(worktree("env_4", null, null));
    assert.equal(ref.label, "worktree");
    assert.equal(ref.key, "env_4");
  });

  it("treats blank alias and branch as absent", () => {
    const ref = workspaceRefOf(worktree("env_5", "   ", "  "));
    assert.equal(ref.label, "worktree");
    assert.equal(ref.alias, null);
    assert.equal(ref.branch, null);
  });

  it("does not treat a project checkout as a worktree", () => {
    const ref = workspaceRefOf(
      thread({
        id: "env_6",
        name: "checkout",
        branchName: "main",
        providerId: null,
        workspaceDisplayKind: "other",
      }),
    );
    assert.equal(ref.kind, "main");
    assert.equal(ref.alias, null);
    assert.equal(ref.branch, null);
  });

  it("keeps a thread with no environment out of any worktree", () => {
    const ref = workspaceRefOf(thread(null));
    assert.equal(ref.kind, "none");
    assert.equal(ref.label, "No workspace");
  });

  it("gives each worktree a distinct key even with the same branch", () => {
    // Two worktrees can sit on the same branch name; the environment id is what
    // keeps them as two nodes rather than collapsing them into one.
    const first = workspaceRefOf(worktree("env_a", "one", "main"));
    const second = workspaceRefOf(worktree("env_b", "two", "main"));
    assert.notEqual(first.key, second.key);
    assert.equal(shouldShowWorkspaces([first, second]), true);
  });

  it("keeps a single-worktree project flat", () => {
    const only = workspaceRefOf(worktree("env_only", "one", "main"));
    assert.equal(shouldShowWorkspaces([only, only]), false);
  });
});

/**
 * A ref as the tree hands it to a row. The row only reads these three fields,
 * so the planner is tested against them rather than against a whole DTO.
 */
function ref(
  alias: string | null,
  branch: string | null,
  label = alias ?? branch ?? "worktree",
): WorkspaceRef {
  return {
    kind: "worktree",
    key: "env_x",
    label,
    alias,
    branch,
    environmentId: "env_x",
  };
}

const MODES: readonly WorkspaceLabelMode[] = [
  "alias-over-branch",
  "alias-and-branch",
  "alias-only",
  "branch-only",
];

describe("workspaceRowLabel", () => {
  it("stacks the alias over the branch by default", () => {
    const drawn = workspaceRowLabel(
      ref("登录重构", "feature/login"),
      "alias-over-branch",
    );
    assert.deepEqual(drawn, {
      label: "登录重构",
      labelIsBranch: false,
      detail: "feature/login",
      stacked: true,
    });
  });

  it("puts both on one line when asked, keeping the branch monospaced", () => {
    const drawn = workspaceRowLabel(
      ref("登录重构", "feature/login"),
      "alias-and-branch",
    );
    assert.equal(drawn.label, "登录重构");
    assert.equal(drawn.labelIsBranch, false);
    assert.equal(drawn.detail, "feature/login");
    assert.equal(drawn.stacked, false);
  });

  it("drops the branch in alias-only and the alias in branch-only", () => {
    const source = ref("登录重构", "feature/login");
    const aliasOnly = workspaceRowLabel(source, "alias-only");
    assert.equal(aliasOnly.label, "登录重构");
    assert.equal(aliasOnly.detail, null);
    assert.equal(aliasOnly.stacked, false);

    const branchOnly = workspaceRowLabel(source, "branch-only");
    assert.equal(branchOnly.label, "feature/login");
    assert.equal(branchOnly.labelIsBranch, true);
    assert.equal(branchOnly.detail, null);
  });

  it("draws a half that is not there only once", () => {
    for (const mode of MODES) {
      const onlyAlias = workspaceRowLabel(ref("登录重构", null), mode);
      assert.equal(onlyAlias.label, "登录重构", mode);
      assert.equal(onlyAlias.detail, null, mode);
      assert.equal(onlyAlias.stacked, false, mode);

      const onlyBranch = workspaceRowLabel(ref(null, "feature/login"), mode);
      assert.equal(onlyBranch.label, "feature/login", mode);
      assert.equal(onlyBranch.labelIsBranch, true, mode);
      assert.equal(onlyBranch.detail, null, mode);
    }
  });

  it("never repeats an alias that already reads as its branch", () => {
    // Stacking this would print one string on two lines, and the one-line modes
    // would print it twice side by side.
    for (const mode of MODES) {
      const drawn = workspaceRowLabel(ref("main", "main"), mode);
      assert.equal(drawn.label, "main", mode);
      assert.equal(drawn.detail, null, mode);
      assert.equal(drawn.stacked, false, mode);
    }
  });

  it("keeps a nameless workspace drawing its own fallback label", () => {
    for (const mode of MODES) {
      const drawn = workspaceRowLabel(ref(null, null, "worktree"), mode);
      assert.equal(drawn.label, "worktree", mode);
      assert.equal(drawn.detail, null, mode);
      assert.equal(drawn.stacked, false, mode);
    }
  });
});
