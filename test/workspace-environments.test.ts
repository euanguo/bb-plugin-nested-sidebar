import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { buildTree } from "../lib/tree.ts";
import type { ProjectThreadGroup, ThreadFamily } from "../lib/inbox.ts";
import {
  workspaceRefOf,
  workspaceRefOfEnvironment,
  type WorkspaceEnvironmentDescriptor,
  type WorkspaceProjectDescriptor,
} from "../lib/workspace.ts";

const NOW = 1_700_000_000_000;

type ThreadEnvironment = NonNullable<PluginSidebarThread["environment"]>;

function environmentRef(
  id: string,
  name: string | null,
  branchName: string | null,
): ThreadEnvironment {
  return {
    id,
    name,
    branchName,
    providerId: "project-checkout",
    workspaceDisplayKind: null,
  };
}

function thread(
  id: string,
  projectId: string,
  environment: ThreadEnvironment | null,
): PluginSidebarThread {
  return {
    id,
    projectId,
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
    environment,
    host: null,
    createdAt: NOW - 1_000,
    updatedAt: NOW - 1_000,
    lastReadAt: null,
    latestAttentionAt: NOW - 1_000,
  };
}

function family(
  id: string,
  projectId: string,
  environment: ThreadEnvironment | null,
): ThreadFamily {
  return { root: thread(id, projectId, environment), children: [] };
}

function group(
  id: string,
  families: ThreadFamily[],
): ProjectThreadGroup {
  return { project: { id, name: id, isPersonal: false }, families };
}

function descriptor(
  id: string,
  projectId: string,
  path: string,
  extra: Partial<WorkspaceEnvironmentDescriptor> = {},
): WorkspaceEnvironmentDescriptor {
  return {
    id,
    projectId,
    hostId: "host_1",
    path,
    isGitRepo: true,
    isWorktree: true,
    branchName: null,
    name: null,
    providerId: "project-checkout",
    workspaceDisplayKind: "unmanaged-worktree",
    ...extra,
  };
}

function descriptorMap(
  ...descriptors: WorkspaceEnvironmentDescriptor[]
): ReadonlyMap<string, WorkspaceEnvironmentDescriptor> {
  return new Map(descriptors.map((item) => [item.id, item]));
}

function projectMap(
  ...entries: WorkspaceProjectDescriptor[]
): ReadonlyMap<string, WorkspaceProjectDescriptor> {
  return new Map(entries.map((item) => [item.projectId, item]));
}

function tree(
  projectGroups: ProjectThreadGroup[],
  environments: ReadonlyMap<string, WorkspaceEnvironmentDescriptor> = new Map(),
  projects: ReadonlyMap<string, WorkspaceProjectDescriptor> = new Map(),
) {
  return buildTree({
    projectGroups,
    now: NOW,
    assignment: {},
    groupOrder: [],
    workspaceOrder: {},
    ungroupedIcon: "FolderTreeIcon",
    environments,
    projects,
  });
}

describe("a workspace outlives the conversations in it", () => {
  /**
   * The case the row exists for. Settling archives the last thread in a
   * worktree, which takes its family out of the tree — and the worktree has to
   * stay, because the row's `+` is the only way back into it.
   */
  it("keeps a worktree row whose threads have all been settled", () => {
    const settledOut = descriptor("env_settled", "p1", "/work/trees/only-one", {
      branchName: "feat/only-one",
      name: "只剩归档对话的分支",
    });
    const occupied = descriptor("env_live", "p1", "/work/trees/still-busy", {
      branchName: "feat/still-busy",
      name: "还有对话的分支",
    });

    // No families: every thread in this project is parked on a shelf.
    const nodes = tree(
      [group("p1", [])],
      descriptorMap(settledOut, occupied),
      projectMap(
        { projectId: "p1", sourcePath: "/work/repo", sourceHostId: "host_1" },
      ),
    );

    const workspaces = nodes.flatMap((node) =>
      node.projects.flatMap((project) => project.workspaces),
    );
    const labels = workspaces.map((workspace) => workspace.ref.label).sort();
    assert.deepEqual(labels, ["只剩归档对话的分支", "还有对话的分支"]);
    for (const workspace of workspaces) {
      assert.deepEqual(workspace.families, []);
      assert.notEqual(workspace.ref.environmentId, null);
    }
  });

  /**
   * The identity the tree groups by is `key`. An environment-only row that
   * computed a different one would draw a second row beside the worktree its
   * own threads already occupy.
   */
  it("merges an empty environment into the row its threads built", () => {
    const live = descriptor("env_live", "p1", "/work/trees/busy", {
      branchName: "feat/busy",
      name: "有对话的分支",
    });
    const empty = descriptor("env_empty", "p1", "/work/trees/empty", {
      branchName: "feat/empty",
      name: "没有对话的分支",
    });
    const projects = projectMap({
      projectId: "p1",
      sourcePath: "/work/repo",
      sourceHostId: "host_1",
    });

    const nodes = tree(
      [
        group("p1", [
          family("t1", "p1", environmentRef("env_live", "有对话的分支", "feat/busy")),
        ]),
      ],
      descriptorMap(live, empty),
      projects,
    );
    const workspaces = nodes.flatMap((node) =>
      node.projects.flatMap((project) => project.workspaces),
    );

    assert.equal(workspaces.length, 2);
    const busy = workspaces.find(
      (workspace) => workspace.ref.environmentId === "env_live",
    );
    assert.equal(busy?.families.length, 1, "the thread's own row must survive");

    // The invariant the merge depends on: one descriptor, one key, whichever
    // side of the tree asked for it.
    for (const workspace of workspaces) {
      const item = descriptorMap(live, empty).get(
        workspace.ref.environmentId ?? "",
      );
      assert.equal(
        workspaceRefOfEnvironment(item!, projects)?.key,
        workspace.ref.key,
      );
    }
  });

  it("keeps environments of other projects out of this one", () => {
    const mine = descriptor("env_mine", "p1", "/work/trees/mine");
    const theirs = descriptor("env_theirs", "p2", "/work/trees/theirs");

    const nodes = tree(
      [group("p1", [])],
      descriptorMap(mine, theirs),
      projectMap(
        { projectId: "p1", sourcePath: "/work/repo", sourceHostId: "host_1" },
        { projectId: "p2", sourcePath: "/work/other", sourceHostId: "host_1" },
      ),
    );

    const ids = nodes.flatMap((node) =>
      node.projects.flatMap((project) =>
        project.workspaces.map((workspace) => workspace.ref.environmentId),
      ),
    );
    assert.deepEqual(ids, ["env_mine"]);
  });

  /**
   * A personal workspace is not a place on disk, so it is not a row: it is what
   * `workspaceRefOf` reports as the no-workspace bucket.
   */
  it("invents no row for a personal environment", () => {
    const personal = descriptor("env_personal", "p1", "/work/personal", {
      providerId: "personal-workspace",
      isWorktree: false,
      workspaceDisplayKind: null,
    });

    const nodes = tree(
      [group("p1", [])],
      descriptorMap(personal),
      projectMap({
        projectId: "p1",
        sourcePath: "/work/repo",
        sourceHostId: "host_1",
      }),
    );

    const workspaces = nodes.flatMap((node) =>
      node.projects.flatMap((project) => project.workspaces),
    );
    assert.equal(
      workspaces.filter((workspace) => workspace.ref.kind !== "personal").length,
      0,
    );
  });
});

describe("workspaceRefOfEnvironment", () => {
  it("is the ref the same environment's threads produce", () => {
    const item = descriptor("env_1", "p1", "/work/trees/one", {
      branchName: "feat/one",
      name: "分支一",
    });
    const projects = projectMap({
      projectId: "p1",
      sourcePath: "/work/repo",
      sourceHostId: "host_1",
    });

    const fromThread = workspaceRefOf(
      thread("t1", "p1", environmentRef("env_1", "分支一", "feat/one")),
      descriptorMap(item),
      projects,
    );
    const fromEnvironment = workspaceRefOfEnvironment(item, projects);

    assert.deepEqual(fromEnvironment, fromThread);
  });

  it("is null for a personal environment", () => {
    const item = descriptor("env_personal", "p1", "/work/personal", {
      providerId: "personal-workspace",
    });
    assert.equal(workspaceRefOfEnvironment(item, new Map()), null);
  });
});
