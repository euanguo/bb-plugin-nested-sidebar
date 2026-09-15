import { useCallback, useEffect, useState } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { ORDER_CHANNEL } from "@/server";
import type { ManualOrderMap } from "@/lib/manual-order";
import { clearFamilyOrder, readFamilyOrder } from "@/lib/family-order";
import { clearProjectOrder, readProjectOrder } from "@/lib/project-order";

export interface NestOrderApi {
  /** Group scope key -> project ids. */
  readonly projects: ManualOrderMap;
  /** Project id -> root thread ids. */
  readonly families: ManualOrderMap;
  readonly ready: boolean;
  reorderProjects: (
    groupId: string,
    projectIds: readonly string[],
  ) => Promise<boolean>;
  reorderFamilies: (
    projectId: string,
    rootIds: readonly string[],
  ) => Promise<boolean>;
  refresh: () => void;
}

function isEmptyOrder(
  projects: ManualOrderMap,
  families: ManualOrderMap,
): boolean {
  return (
    Object.keys(projects).length === 0 && Object.keys(families).length === 0
  );
}

/**
 * The manual arrangement, read from the server and re-read on its publish.
 *
 * The one piece of migration lives here: the first build that sees an empty
 * server store pushes the old browser-local order up, so an arrangement made
 * before this existed is not silently lost. It runs once — the seed refuses to
 * write over existing rows, and the legacy keys are cleared on success.
 */
export function useNestOrder(): NestOrderApi {
  const rpc = useRpc<typeof nestRpcContract>();
  const [projects, setProjects] = useState<ManualOrderMap>({});
  const [families, setFamilies] = useState<ManualOrderMap>({});
  const [ready, setReady] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await rpc.call("listManualOrder", {});
        if (cancelled) return;
        if (isEmptyOrder(result.projects, result.families)) {
          const seeded = await seedLegacyOrder(rpc);
          if (cancelled) return;
          if (seeded !== null) {
            setProjects(seeded.projects);
            setFamilies(seeded.families);
            setReady(true);
            return;
          }
        }
        setProjects(result.projects);
        setFamilies(result.families);
        setReady(true);
      } catch {
        // A failed read must not blank the tree: everything still renders, in
        // the default order, until the next read succeeds.
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [nonce, rpc]);

  useRealtime(ORDER_CHANNEL, refresh);

  const reorderProjects = useCallback(
    async (groupId: string, projectIds: readonly string[]) => {
      const next = [...projectIds];
      // Echo the move immediately; the publish that follows re-reads and
      // confirms it, so a drag does not wait on a round trip to land.
      setProjects((current) => ({ ...current, [groupId]: next }));
      try {
        const result = await rpc.call("reorderProjects", {
          groupId,
          projectIds: next,
        });
        if (!result.ok) refresh();
        return result.ok;
      } catch (error) {
        refresh();
        throw error;
      }
    },
    [rpc, refresh],
  );

  const reorderFamilies = useCallback(
    async (projectId: string, rootIds: readonly string[]) => {
      const next = [...rootIds];
      setFamilies((current) => ({ ...current, [projectId]: next }));
      try {
        const result = await rpc.call("reorderFamilies", {
          projectId,
          rootIds: next,
        });
        if (!result.ok) refresh();
        return result.ok;
      } catch (error) {
        refresh();
        throw error;
      }
    },
    [rpc, refresh],
  );

  return {
    projects,
    families,
    ready,
    reorderProjects,
    reorderFamilies,
    refresh,
  };
}

async function seedLegacyOrder(
  rpc: ReturnType<typeof useRpc<typeof nestRpcContract>>,
): Promise<{ projects: ManualOrderMap; families: ManualOrderMap } | null> {
  const legacyProjects = readProjectOrder();
  const legacyFamilies = readFamilyOrder();
  const familyEntries: Array<[string, string[]]> = Object.entries(
    legacyFamilies,
  ).map(([projectId, rootIds]) => [projectId, [...rootIds]]);
  if (legacyProjects.length === 0 && familyEntries.length === 0) return null;
  try {
    const seeded = await rpc.call("seedManualOrder", {
      projectIds: legacyProjects,
      families: Object.fromEntries(familyEntries),
    });
    if (!seeded.ok) return null;
    clearProjectOrder();
    clearFamilyOrder();
    const fresh = await rpc.call("listManualOrder", {});
    return { projects: fresh.projects, families: fresh.families };
  } catch {
    // Keep the legacy keys: the next load can try again.
    return null;
  }
}
