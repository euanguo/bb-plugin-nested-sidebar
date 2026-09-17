import { useEffect, useMemo, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { defineStoreSnapshot } from "@/lib/store-snapshot";
import { WORKSPACE_PATHS_SNAPSHOT_CODEC } from "@/lib/store-persistence";
import type { WorkspacePaths } from "@/lib/workspace";

export type { WorkspacePaths } from "@/lib/workspace";

const EMPTY: WorkspacePaths = { environments: {}, projects: {} };

// A path that is not there yet draws a row without its copy actions, so an
// empty seed takes the actions away and puts them back a round trip later.
// Persisted, because a path only changes when the environment does and a cold
// start would otherwise hide every copy action until the read lands.
const workspacePathsSnapshot = defineStoreSnapshot<WorkspacePaths>(
  "workspace-paths",
  { persist: WORKSPACE_PATHS_SNAPSHOT_CODEC },
);

/**
 * Where every workspace and project actually is on disk.
 *
 * Read at mount and re-read when the sidebar's own live view reports a
 * different fact about one of those environments.
 *
 * Most of this really is fixed for the life of an environment, which is what
 * made reading it once look safe — but the BRANCH is not. An agent that checks
 * a branch out inside a worktree moves git's HEAD; the record this reads is
 * updated by bb, whose own view of the worktree noticed. Nothing in the plugin
 * API reports that: `bb.sdk.environments` has `register` and `recheck` and no
 * change subscription, and bb's `git-refs-changed` notification stays inside
 * the app. What the plugin does have is the live thread view, which carries
 * each thread's environment facts and updates exactly when bb's own sidebar
 * does. Reading them is free, so they are used as the trigger.
 *
 * Without the second read the row keeps naming the branch the worktree was on
 * when the page loaded, while the thread header and the composer's branch
 * picker — which read live host data — name the one it is on now. Two answers
 * to the same question on one screen.
 *
 * The trigger is deliberately narrow: a sorted, de-duplicated signature of the
 * environment facts, so thread activity that says nothing new about an
 * environment does not cost a read.
 */
export function useWorkspacePaths(): WorkspacePaths {
  const rpc = useRpc<typeof nestRpcContract>();
  const { threads } = useSidebarThreads();
  const [paths, setPaths] = useState<WorkspacePaths>(
    () => workspacePathsSnapshot.read() ?? EMPTY,
  );

  const environmentFacts = useMemo(() => {
    const facts = new Set<string>();
    for (const thread of threads) {
      const environment = thread.environment;
      if (environment === null || environment.id === null) continue;
      facts.add(
        [
          environment.id,
          environment.branchName ?? "",
          environment.name ?? "",
        ].join(" "),
      );
    }
    // Sorted, because thread order follows activity: an unsorted join would
    // look like a new fact every time a thread's attention changed.
    return [...facts].sort().join("\n");
  }, [threads]);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("listWorkspacePaths", {})
      .then((result) => {
        if (cancelled) return;
        setPaths(result);
        // After the state, not before it: what is on screen must never depend
        // on the snapshot write having gone through.
        workspacePathsSnapshot.write(result);
      })
      .catch(() => {
        // Nothing to say: the rows still work, they just cannot be copied.
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, environmentFacts]);

  return paths;
}
