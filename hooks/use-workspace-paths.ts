import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";

export interface WorkspacePaths {
  /** environmentId -> the directory that environment works in. */
  readonly environments: Readonly<Record<string, string>>;
  /** projectId -> the project's own checkout. */
  readonly projects: Readonly<Record<string, string>>;
}

const EMPTY: WorkspacePaths = { environments: {}, projects: {} };

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
  const [paths, setPaths] = useState<WorkspacePaths>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("listWorkspacePaths", {})
      .then((result) => {
        if (!cancelled) setPaths(result);
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
