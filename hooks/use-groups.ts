import { useCallback, useEffect, useState } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { GROUP_CHANNEL } from "@/server";
import type { GroupAssignment, ProjectGroup } from "@/lib/groups";
import {
  DEFAULT_SCOPE_ICONS,
  type ScopeIcons,
} from "@/lib/group-scope-icons";
import { defineStoreSnapshot } from "@/lib/store-snapshot";

interface GroupsSnapshot {
  readonly groups: readonly ProjectGroup[];
  readonly assignment: GroupAssignment;
  readonly icons: ScopeIcons;
}

// Groups and their assignment decide which section every project is drawn in,
// so an empty seed is not a missing row — it is every project in Ungrouped.
const groupsSnapshot = defineStoreSnapshot<GroupsSnapshot>("groups");

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
  // The previous mount's answer, so returning from a route that unmounted the
  // list paints the arrangement the user left rather than the ungrouped one.
  const [seed] = useState(() => groupsSnapshot.read());
  const [groups, setGroups] = useState<readonly ProjectGroup[]>(
    seed?.groups ?? [],
  );
  const [assignment, setAssignment] = useState<GroupAssignment>(
    seed?.assignment ?? {},
  );
  const [icons, setIcons] = useState<ScopeIcons>(
    seed?.icons ?? DEFAULT_SCOPE_ICONS,
  );
  const [ready, setReady] = useState(seed !== undefined);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    rpc
      .call("listGroups", {})
      .then((result) => {
        if (cancelled) return;
        groupsSnapshot.write({
          groups: result.groups,
          assignment: result.assignment,
          icons: result.icons,
        });
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
