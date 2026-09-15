import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
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
 * Read once and kept: a path belongs to an environment for as long as that
 * environment exists, and the copy actions that need one are only drawn when it
 * is known. A failed read leaves the menus without their copy actions rather
 * than with ones that copy nothing.
 */
export function useWorkspacePaths(): WorkspacePaths {
  const rpc = useRpc<typeof nestRpcContract>();
  const [paths, setPaths] = useState<WorkspacePaths>(
    () => workspacePathsSnapshot.read() ?? EMPTY,
  );

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
  }, [rpc]);

  return paths;
}
