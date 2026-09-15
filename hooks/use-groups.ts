import { useCallback, useEffect, useState } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { GROUP_CHANNEL } from "@/server";
import type { GroupAssignment, ProjectGroup } from "@/lib/groups";
import {
  DEFAULT_SCOPE_ICONS,
  type ScopeIcons,
} from "@/lib/group-scope-icons";

export interface GroupsApi {
  readonly groups: readonly ProjectGroup[];
  readonly assignment: GroupAssignment;
  /** The icons of the strip's own All and Ungrouped tabs. */
  readonly icons: ScopeIcons;
  readonly ready: boolean;
  refresh: () => void;
}

/**
 * The group store, read once on mount and re-read on the plugin's own publish.
 * Every mutation goes through the server so the ordering and membership rules
 * live in one place; this hook only mirrors them.
 */
export function useGroups(): GroupsApi {
  const rpc = useRpc<typeof nestRpcContract>();
  const [groups, setGroups] = useState<readonly ProjectGroup[]>([]);
  const [assignment, setAssignment] = useState<GroupAssignment>({});
  const [icons, setIcons] = useState<ScopeIcons>(DEFAULT_SCOPE_ICONS);
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("listGroups", {})
      .then((result) => {
        if (cancelled) return;
        setGroups(result.groups);
        setAssignment(result.assignment);
        setIcons(result.icons);
        setReady(true);
      })
      .catch(() => {
        // A failed read must not blank the tree: the projects still render,
        // they just render as ungrouped until the next read succeeds.
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, rpc]);

  useRealtime(GROUP_CHANNEL, refresh);

  return { groups, assignment, icons, ready, refresh };
}
