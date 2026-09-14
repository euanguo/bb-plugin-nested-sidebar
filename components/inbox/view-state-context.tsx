import { createContext, useContext, type ReactNode } from "react";

/**
 * The tree's remembered shape, shared with every level.
 *
 * Collapsing is a per-row decision made in four different components (group,
 * project, workspace, thread family), and each of them used to hold its own
 * `useState`. That is why the shape was lost on reload: the state lived and
 * died inside the row. Lifting it into one context lets `ThreadInbox` own the
 * single persisted record while the rows keep rendering exactly as before.
 *
 * Each accessor answers the question the row actually asks. Groups and
 * projects default to open, so they store the collapsed set; a workspace
 * defaults to closed, so it stores the expanded set. Keeping that asymmetry in
 * the context rather than in each row means a row cannot accidentally invert
 * its own default.
 */
export interface NestViewStateApi {
  isGroupCollapsed: (groupId: string) => boolean;
  setGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  isProjectCollapsed: (projectId: string) => boolean;
  setProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  isWorkspaceExpanded: (workspaceKey: string) => boolean;
  setWorkspaceExpanded: (workspaceKey: string, expanded: boolean) => void;
  /**
   * A thread family's explicit override, or null to follow the preference.
   * The override is what a user's own disclosure click writes.
   */
  familyOverride: (rootId: string) => boolean | null;
  setFamilyOverride: (rootId: string, expanded: boolean | null) => void;
}

const NestViewStateContext = createContext<NestViewStateApi | null>(null);

export function NestViewStateProvider({
  value,
  children,
}: {
  value: NestViewStateApi;
  children: ReactNode;
}) {
  return (
    <NestViewStateContext.Provider value={value}>
      {children}
    </NestViewStateContext.Provider>
  );
}

/**
 * The tree's view state. Rows are only ever rendered under the provider, so a
 * missing provider is a programming error rather than a state to tolerate: a
 * silent fallback would hide exactly the bug this context exists to prevent.
 */
export function useNestViewState(): NestViewStateApi {
  const value = useContext(NestViewStateContext);
  if (value === null) {
    throw new Error("Nest view state is unavailable outside the thread inbox.");
  }
  return value;
}
