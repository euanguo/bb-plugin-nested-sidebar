import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  experimental_useProviders as useProviders,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRpc,
  useSettings,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { GroupSection } from "@/components/inbox/group-section";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import { SlimRow } from "@/components/inbox/slim-row";
import { ViewMenu } from "@/components/inbox/view-menu";
import {
  BulkDeleteDialog,
  type BulkDeletePreviewView,
} from "@/components/inbox/bulk-delete-dialog";
import { useLifecycle } from "@/hooks/use-lifecycle";
import { useSettledThreads } from "@/hooks/use-settled-threads";
import { useProjectColors } from "@/hooks/use-project-colors";
import { useProjectIcons } from "@/hooks/use-project-icons";
import {
  mergeSettledThreads,
  pendingSettledCount,
} from "@/lib/settled-threads";
import { TRAILING_GLYPH_BOX_CLASS } from "@/components/inbox/status-slot";
import {
  groupThreadsByProject,
  searchProjectThreadGroups,
  searchThreadsByTitle,
  sortByCreatedAtDescending,
  visibleInboxThreads,
} from "@/lib/inbox";
import { familyStatus } from "@/lib/family-status";
import { worstKind } from "@/lib/rollup";
import {
  applyRootSelection,
  filterProjectThreadGroups,
  includeSelectedFamilies,
  pruneSelectedRootIds,
  selectableRootIds,
  type ThreadFilterPreset,
  type RootSelectionIntent,
} from "@/lib/thread-management";
import {
  nestPreferenceStyle,
  resolveNestPreferences,
} from "@/lib/preferences";
import {
  keyboardFamilyMove,
  moveProjectFamily,
  type FamilyMoveResult,
} from "@/lib/family-order";
import {
  keyboardProjectMove,
  moveProject,
  type ProjectMoveResult,
} from "@/lib/project-order";
import {
  orderFamilies,
  orderProjectGroups,
  orderedProjectIds,
  projectOrderScope,
} from "@/lib/ordering";
import { useNestOrder } from "@/hooks/use-nest-order";
import { useViewPreferences } from "@/hooks/use-view-preferences";
import { GroupTabs, type GroupTab } from "@/components/inbox/group-tabs";
import { ProjectNode as ProjectNodeView } from "@/components/inbox/project-node";
import {
  NestViewStateProvider,
  type NestViewStateApi,
} from "@/components/inbox/view-state-context";
import {
  ALL_SCOPE_KEY,
  UNGROUPED_SCOPE_KEY,
  readViewState,
  resolveGroupScope,
  withId,
  foldWorkspaceExpansion,
  writeViewState,
  type NestViewState,
} from "@/lib/view-state";
import {
  COPY_ANNOUNCEMENT_EVENT,
} from "@/lib/clipboard";

import { GroupManagerDialog } from "@/components/inbox/group-manager-dialog";
import {
  NewThreadDialog,
  type NewThreadSeed,
} from "@/components/inbox/new-thread-dialog";
import { useGroups } from "@/hooks/use-groups";
import { useWorkspacePaths } from "@/hooks/use-workspace-paths";
import {
  groupScopeKey,
  projectInScope,
  shouldShowUngroupedTab,
  type GroupAssignment,
  type GroupScope,
} from "@/lib/groups";
import { buildTree, searchTree, threadAncestors } from "@/lib/tree";
import { workspaceRefOf, type WorkspaceRef } from "@/lib/workspace";
import {
  keyboardWorkspaceMove,
  moveProjectWorkspace,
  orderWorkspaces,
  type WorkspaceMoveResult,
} from "@/lib/workspace-order";
import type { WorkspaceLaunch, TreeRowHandlers } from "@/components/inbox/tree-rows";

const EMPTY_STATE_CLASS = "px-2 py-6 text-center text-xs text-muted-foreground";

/**
 * How long a freshly spawned thread is awaited in the sidebar's own view before
 * the plugin stops trying to open it. Long enough for a create to round-trip
 * through the host's cache, short enough that a thread this client will never
 * be handed does not sit pending for the rest of the session.
 */
const PENDING_OPEN_TIMEOUT_MS = 15_000;

/**
 * A project-first inbox. Project sections stay put; roots keep their creation
 * order; active root/child families expand in place instead of jumping around.
 */
export function ThreadInbox({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads: hostThreads, projects } = useSidebarThreads();
  const { providers } = useProviders();
  const rpc = useRpc<typeof nestRpcContract>();
  const settings = useSettings();
  const preferences = useMemo(
    () => resolveNestPreferences(settings.values),
    [settings.values],
  );
  const { overrides: projectColorOverrides } = useProjectColors();
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const { icons: projectIcons } = useProjectIcons({
    projectIds,
    enabled: preferences.autoProjectIcons,
  });
  const groupsApi = useGroups();
  const paths = useWorkspacePaths();
  /**
   * The remembered view, read once at mount and written on every change.
   *
   * bb restores the route but nothing about the tree's shape, so without this
   * a reload drops the user back on "All" with everything expanded. The whole
   * record is one object on purpose: a single write keeps the scope, the
   * filter, and every collapsed id consistent, so a crash between two writes
   * cannot leave a filter from one session over a scope from another.
   */
  const [viewState, setViewState] = useState<NestViewState>(readViewState);
  const groupScope: GroupScope = useMemo(
    () =>
      resolveGroupScope(
        viewState.scope,
        new Set(groupsApi.groups.map((group) => group.id)),
      ),
    [groupsApi.groups, viewState.scope],
  );
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  /** The group a tab's pencil asked to rename, when the strip is the entry. */
  const sidebarActions = useSidebarThreadActions();
  /** The workspace row a `+` asked to start a thread in, when there is one. */
  const [newThreadSeed, setNewThreadSeed] = useState<NewThreadSeed | null>(null);
  const inboxRef = useRef<HTMLDivElement>(null);
  const selectionAnchorRootId = useRef<string | null>(null);
  /** The thread whose ancestors have already been opened for this session. */
  const revealedThreadRef = useRef<string | null>(null);
  const selectionHintId = useId();
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / 60_000),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setNowMinute(Math.floor(Date.now() / 60_000)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = nowMinute * 60_000;

  // Settling archives a thread in bb, so the host list alone cannot draw the
  // settled shelf. Merge the plugin's bounded archived read back in first.
  const { threads: settledThreads, rowsPending: settledRowsPending } =
    useSettledThreads(now);
  const threads = useMemo(
    () => mergeSettledThreads(hostThreads, settledThreads),
    [hostThreads, settledThreads],
  );
  /**
   * A thread this plugin just spawned, waiting to be opened.
   *
   * `sidebarActions.open` is a silent no-op for a thread the host's client
   * store has not received yet — it looks the id up and returns if it is not
   * there. A spawn is always inside that window: the create RPC answers before
   * the sidebar's own read catches up, so opening on the spot does nothing and
   * the user is left on the composer they just submitted. The id waits here
   * instead and is opened on the render that brings the thread in.
   */
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (pendingOpenId === null) return;
    if (!hostThreads.some((thread) => thread.id === pendingOpenId)) return;
    setPendingOpenId(null);
    sidebarActions.open(pendingOpenId);
  }, [hostThreads, pendingOpenId, sidebarActions]);
  // A thread the sidebar never hands back — one spawned into a view this
  // client does not hold — must not leave this waiting for the session.
  useEffect(() => {
    if (pendingOpenId === null) return;
    const timer = setTimeout(() => setPendingOpenId(null), PENDING_OPEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingOpenId]);
  const lifecycle = useLifecycle(threads);
  const showSnoozed = viewState.snoozedOpen;
  const showSettled = viewState.settledOpen;
  const filterPreset = viewState.filter;
  const [selectionMode, setSelectionMode] = useState(false);
  /**
   * The manual arrangement and the sort lenses, both server-backed. The
   * arrangement is the user's own data; the lenses decide whether it is read.
   */
  const order = useNestOrder();
  const viewPreferences = useViewPreferences();
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  /**
   * Copy feedback from the row menus, which live too far below this surface to
   * hand a callback through. The live region stays here, where it is announced
   * once for the whole tree.
   */
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        setCopyAnnouncement(event.detail);
      }
    };
    window.addEventListener(COPY_ANNOUNCEMENT_EVENT, onAnnounce);
    return () =>
      window.removeEventListener(COPY_ANNOUNCEMENT_EVENT, onAnnounce);
  }, []);
  const [selectedRootIds, setSelectedRootIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkPreview, setBulkPreview] =
    useState<BulkDeletePreviewView | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkOutcomes, setBulkOutcomes] = useState<
    Array<{ id: string; message: string; failed: boolean }>
  >([]);

  /**
   * One write path for the remembered view.
   *
   * The setter takes a patch rather than a whole state so callers never have to
   * spread the record themselves — that is how a scope change would silently
   * drop a collapse. The write is best-effort: a browser refusing storage
   * leaves the session working, just without persistence.
   */
  const patchViewState = (patch: Partial<NestViewState>) => {
    setViewState((current) => {
      const next = { ...current, ...patch };
      writeViewState(next);
      return next;
    });
  };

  const viewStateApi: NestViewStateApi = useMemo(
    () => ({
      isGroupCollapsed: (groupId) =>
        viewState.collapsedGroups.includes(groupId),
      setGroupCollapsed: (groupId, collapsed) =>
        patchViewState({
          collapsedGroups: withId(
            viewState.collapsedGroups,
            groupId,
            collapsed,
          ),
        }),
      isProjectCollapsed: (projectId) =>
        viewState.collapsedProjects.includes(projectId),
      setProjectCollapsed: (projectId, collapsed) =>
        patchViewState({
          collapsedProjects: withId(
            viewState.collapsedProjects,
            projectId,
            collapsed,
          ),
        }),
      isWorkspaceExpanded: (workspaceKey) =>
        viewState.expandedWorkspaces.includes(workspaceKey),
      setWorkspaceFolded: ({ keys, openKey, expanded }) =>
        patchViewState({
          expandedWorkspaces: foldWorkspaceExpansion(
            viewState.expandedWorkspaces,
            keys,
            openKey,
            expanded,
          ),
        }),
      setWorkspaceExpanded: (workspaceKey, expanded) =>
        patchViewState({
          expandedWorkspaces: withId(
            viewState.expandedWorkspaces,
            workspaceKey,
            expanded,
          ),
        }),
      familyOverride: (rootId) => {
        if (viewState.collapsedFamilies.includes(rootId)) return false;
        if (viewState.expandedFamilies.includes(rootId)) return true;
        return null;
      },
      setFamilyOverride: (rootId, expanded) => {
        if (expanded === null) {
          patchViewState({
            expandedFamilies: withId(viewState.expandedFamilies, rootId, false),
            collapsedFamilies: withId(
              viewState.collapsedFamilies,
              rootId,
              false,
            ),
          });
          return;
        }
        patchViewState({
          expandedFamilies: withId(viewState.expandedFamilies, rootId, expanded),
          collapsedFamilies: withId(
            viewState.collapsedFamilies,
            rootId,
            !expanded,
          ),
        });
      },
    }),
    [viewState],
  );

  /** The scope key the strip highlights, derived back from the resolved scope. */
  const activeScopeKey =
    groupScope.kind === "all"
      ? ALL_SCOPE_KEY
      : groupScope.kind === "ungrouped"
        ? UNGROUPED_SCOPE_KEY
        : groupScope.groupId;

  const providerInfoById = useMemo<
    ReadonlyMap<string, ProviderGlyphInfo>
  >(
    () =>
      new Map(
        providers.map((provider) => [
          provider.id,
          {
            displayName: provider.displayName,
            logoUrl: provider.logoUrl,
          },
        ]),
      ),
    [providers],
  );

  const { unfilteredProjectGroups, projectGroups, snoozed, settled, groupTabs, treeNodes } = useMemo(() => {
    const validGroupIds = new Set(groupsApi.groups.map((group) => group.id));
    const visible = visibleInboxThreads(threads, lifecycle.parkedThreadIds);
    const active: PluginSidebarThread[] = [];
    const onSnoozeShelf: PluginSidebarThread[] = [];
    const onSettledShelf: PluginSidebarThread[] = [];

    for (const thread of visible) {
      const shelf = lifecycle.shelfFor(thread);
      if (shelf === "snoozed") onSnoozeShelf.push(thread);
      else if (shelf === "settled") onSettledShelf.push(thread);
      else active.push(thread);
    }

    // Projects are ordered per group, then each project's families by the
    // thread lens. Both run before filtering and search, so a hidden row never
    // moves and the visible order is always a slice of the complete one.
    const unfilteredProjectGroups = orderProjectGroups(
      groupThreadsByProject(active, projects),
      {
        assignment: groupsApi.assignment,
        groupOrder: groupsApi.groups.map((group) => group.id),
        manual: order.projects,
        mode: viewPreferences.projectSort,
        now,
      },
    ).map((group) => ({
      ...group,
      families: orderFamilies(group.families, {
        manual: order.families[group.project.id],
        mode: viewPreferences.threadSort,
        now,
      }),
    }));
    const filteredProjectGroups = filterProjectThreadGroups(
      unfilteredProjectGroups,
      filterPreset,
      now,
    );

    const searchedProjectGroups = searchProjectThreadGroups(
      filteredProjectGroups,
      searchQuery,
    );
    const scopedProjectGroups = searchedProjectGroups.filter((group) =>
      projectInScope(
        groupScope,
        groupsApi.assignment,
        validGroupIds,
        group.project.id,
      ),
    );
    const projectGroups = selectionMode
      ? includeSelectedFamilies(
          scopedProjectGroups,
          unfilteredProjectGroups,
          selectedRootIds,
        )
      : scopedProjectGroups;

    // The group strip counts every project in a group, not just the ones that
    // survived search, so the numbers do not shift while the user types.
    const countFor = (scope: GroupScope) =>
      unfilteredProjectGroups.filter((group) =>
        projectInScope(scope, groupsApi.assignment, validGroupIds, group.project.id),
      ).length;
    // Each tab shows the worst state anywhere beneath it, folded from the same
    // rollups the tree rows use, so the strip and the tree never disagree about
    // whether a scope has anything running.
    const kindFor = (scope: GroupScope) => {
      const scoped = unfilteredProjectGroups.filter((group) =>
        projectInScope(
          scope,
          groupsApi.assignment,
          validGroupIds,
          group.project.id,
        ),
      );
      if (scoped.length === 0) return null;
      const kind = worstKind(
        scoped.flatMap((group) =>
          group.families.map((family) =>
            familyStatus([family.root, ...family.children], now).kind,
          ),
        ),
      );
      return kind === "inactive" || kind === "stale" ? null : kind;
    };
    const groupTabs: GroupTab[] = [
      {
        scope: { kind: "all" },
        label: "All",
        count: countFor({ kind: "all" }),
        icon: groupsApi.icons.all,
        statusKind: kindFor({ kind: "all" }),
      },
      ...groupsApi.groups.map((group) => {
        const scope: GroupScope = { kind: "group", groupId: group.id };
        return {
          scope,
          label: group.name,
          count: countFor(scope),
          icon: group.icon,
          statusKind: kindFor(scope),
        };
      }),
    ];
    // "Ungrouped" is a real destination, but only once groups exist and only
    // while something is in it. A project filed out of its last group brings
    // the tab straight back.
    const ungroupedScope: GroupScope = { kind: "ungrouped" };
    const ungroupedCount = countFor(ungroupedScope);
    if (shouldShowUngroupedTab(groupsApi.groups.length, ungroupedCount)) {
      groupTabs.push({
        scope: ungroupedScope,
        label: "Ungrouped",
        count: ungroupedCount,
        icon: groupsApi.icons.ungrouped,
        statusKind: kindFor(ungroupedScope),
      });
    }

    // The tree is built from the filtered projects, then flat-searched once
    // more so a hit three levels down keeps its ancestors and hides the
    // branches it does not touch.
    const treeNodes = searchTree(
      buildTree({
        projectGroups,
        now,
        assignment: groupsApi.assignment,
        groupOrder: groupsApi.groups.map((group) => ({
          id: group.id,
          name: group.name,
          icon: group.icon,
        })),
        ungroupedIcon: groupsApi.icons.ungrouped,
        workspaceOrder: order.workspaces,
        worktreeSort: viewPreferences.worktreeSort,
        environments: new Map(Object.entries(paths.environments)),
        projects: new Map(Object.entries(paths.projects)),
      }),
      searchQuery,
    );

    return {
      unfilteredProjectGroups,
      projectGroups,
      groupTabs,
      treeNodes,
      snoozed: searchThreadsByTitle(
        [...onSnoozeShelf].sort(
          (left, right) =>
            (lifecycle.wakeAtFor(left) ?? 0) -
            (lifecycle.wakeAtFor(right) ?? 0),
        ),
        searchQuery,
      ),
      settled: searchThreadsByTitle(
        sortByCreatedAtDescending(onSettledShelf),
        searchQuery,
      ),
    };
  }, [
    filterPreset,
    groupScope,
    groupsApi.assignment,
    groupsApi.groups,
    lifecycle,
    now,
    order.families,
    order.projects,
    projects,
    searchQuery,
    selectedRootIds,
    selectionMode,
    viewPreferences.projectSort,
    viewPreferences.threadSort,
    viewPreferences.worktreeSort,
    threads,
  ]);

  /**
   * Ungrouped leaves the strip when nothing is in it, so a selection sitting on
   * it would point at a tab that is not drawn and scope the tree to a list that
   * can only be empty.
   *
   * The selection is cleared rather than resolved away on every read, for the
   * same reason `resolveGroupScope` degrades a deleted group instead of
   * remembering it: filing a project back out of a group should not silently
   * re-select Ungrouped later.
   */
  const ungroupedTabVisible = groupTabs.some(
    (tab) => tab.scope.kind === "ungrouped",
  );
  useEffect(() => {
    if (groupScope.kind !== "ungrouped") return;
    if (ungroupedTabVisible) return;
    setViewState((current) =>
      current.scope === UNGROUPED_SCOPE_KEY
        ? { ...current, scope: ALL_SCOPE_KEY }
        : current,
    );
  }, [groupScope.kind, ungroupedTabVisible, setViewState]);

  /**
   * Put the user back where they were.
   *
   * bb restores the route, so the open thread is known before this list draws.
   * If that thread sits inside a collapsed group, project, workspace, or family
   * — or under a scope tab that excludes it — the restored route would point at
   * a row the user cannot see. Opening the path back to it is what turns a
   * restored URL into a restored place.
   *
   * The update is idempotent: once every ancestor is open and the scope
   * contains the thread, the functional update returns the same object and
   * React skips the re-render, so this cannot loop against the tree it just
   * changed.
   */
  useEffect(() => {
    if (activeThreadId === null) return;
    // Only when the open thread actually changes. Re-running on every tree
    // change would immediately undo a collapse the user just made on the row
    // they are working in, which is the opposite of remembering their view.
    if (revealedThreadRef.current === activeThreadId) return;
    revealedThreadRef.current = activeThreadId;
    const ancestors = threadAncestors(treeNodes, activeThreadId);
    if (ancestors === null) {
      // The thread is not on screen yet — the host list is still loading, or
      // the thread is filtered out. Leave the marker unset so the reveal runs
      // again once the tree can answer.
      revealedThreadRef.current = null;
      return;
    }
    const groupKey = ancestors.groupId ?? UNGROUPED_SCOPE_KEY;
    setViewState((current) => {
      const validGroupIds = new Set(groupsApi.groups.map((group) => group.id));
      const scoped = projectInScope(
        resolveGroupScope(current.scope, validGroupIds),
        groupsApi.assignment,
        validGroupIds,
        ancestors.projectId,
      );
      const collapsedGroups = current.collapsedGroups.filter(
        (id) => id !== groupKey,
      );
      const collapsedProjects = current.collapsedProjects.filter(
        (id) => id !== ancestors.projectId,
      );
      const expandedWorkspaces = current.expandedWorkspaces.includes(
        ancestors.workspaceKey,
      )
        ? current.expandedWorkspaces
        : [...current.expandedWorkspaces, ancestors.workspaceKey];
      const collapsedFamilies = current.collapsedFamilies.filter(
        (id) => id !== ancestors.rootId,
      );
      const scope = scoped ? current.scope : groupKey;
      if (
        scope === current.scope &&
        collapsedGroups.length === current.collapsedGroups.length &&
        collapsedProjects.length === current.collapsedProjects.length &&
        expandedWorkspaces.length === current.expandedWorkspaces.length &&
        collapsedFamilies.length === current.collapsedFamilies.length
      ) {
        return current;
      }
      const next = {
        ...current,
        scope,
        collapsedGroups,
        collapsedProjects,
        expandedWorkspaces,
        collapsedFamilies,
      };
      writeViewState(next);
      return next;
    });
  }, [activeThreadId, groupsApi.assignment, groupsApi.groups, treeNodes]);

  useEffect(() => {
    setSelectedRootIds((current) => {
      const next = pruneSelectedRootIds(current, unfilteredProjectGroups);
      return setsEqual(current, next) ? current : next;
    });
  }, [unfilteredProjectGroups]);

  // Lifecycle rows can arrive before the archived thread DTOs they name. Keep
  // the collapsed Settled count truthful during that one round trip.
  const pendingSettled = useMemo(() => {
    if (
      filterPreset !== "all" ||
      selectionMode ||
      !settledRowsPending ||
      searchQuery.trim().length > 0
    ) {
      return 0;
    }
    return pendingSettledCount(
      lifecycle.parkedRows.values(),
      new Set(threads.map((thread) => thread.id)),
      now,
    );
  }, [
    lifecycle.parkedRows,
    filterPreset,
    now,
    searchQuery,
    selectionMode,
    settledRowsPending,
    threads,
  ]);

  const activeVisibleCount = projectGroups.reduce(
    (total, group) =>
      total +
      group.families.reduce(
        (groupTotal, family) => groupTotal + 1 + family.children.length,
        0,
      ),
    0,
  );
  const showParkedShelves = filterPreset === "all" && !selectionMode;
  const visibleTotal = showParkedShelves
    ? activeVisibleCount + snoozed.length + settled.length + pendingSettled
    : activeVisibleCount;
  const searching = searchQuery.trim().length > 0;
  /**
   * Reordering needs the complete, unfiltered, unsearched list — otherwise a
   * hidden row would move implicitly — and it needs the mode that reads the
   * manual order. A time or name sort has no place to drop a dragged row.
   */
  const sharedReorderBlocker = selectionMode
    ? "Exit bulk selection to reorder."
    : filterPreset !== "all"
      ? "Choose the All filter to reorder."
      : searching
        ? "Clear search to reorder."
        : null;
  const familyReorderDisabledReason =
    sharedReorderBlocker ??
    (viewPreferences.threadSort !== "manual"
      ? "Choose the Manual thread sort to drag thread families."
      : null);
  const reorderEnabled = familyReorderDisabledReason === null;
  /*
   * Worktrees are dragged only under the manual order, for the same reason
   * projects are: the drag writes the *drawn* order as the arrangement, and
   * under a lens what is drawn is the lens's ranking, not the user's. Letting
   * that through both loses their arrangement and leaves a row that looks
   * draggable — the grab cursor is on the whole row — while a click that
   * wobbled is being spent on a reorder instead of on opening the row. The
   * shared blocker still applies on top: a row hidden by search, a filter, or
   * bulk selection must never move implicitly.
   */
  const workspaceReorderDisabledReason =
    sharedReorderBlocker ??
    (viewPreferences.worktreeSort !== "manual"
      ? "Choose the Manual worktree sort to drag worktrees."
      : null);
  const workspaceReorderEnabled = workspaceReorderDisabledReason === null;
  const projectReorderDisabledReason =
    sharedReorderBlocker ??
    (viewPreferences.projectSort !== "manual"
      ? "Choose the Manual project sort to drag projects."
      : null);
  const projectReorderEnabled = projectReorderDisabledReason === null;
  const selectableVisibleRootIds = useMemo(
    () => selectableRootIds(projectGroups, activeThreadId),
    [activeThreadId, projectGroups],
  );
  const visibleRootCount = projectGroups.reduce(
    (total, group) => total + group.families.length,
    0,
  );
  const visibleRootOrderKey = projectGroups
    .flatMap((group) => group.families.map((family) => family.root.id))
    .join("\u001f");
  const rootTitleById = useMemo(
    () =>
      new Map(
        unfilteredProjectGroups.flatMap((group) =>
          group.families.map((family) => [
            family.root.id,
            family.root.title?.trim() ||
              family.root.titleFallback?.trim() ||
              "Untitled thread",
          ] as const),
        ),
      ),
    [unfilteredProjectGroups],
  );

  useEffect(() => {
    selectionAnchorRootId.current = null;
  }, [filterPreset, searchQuery, selectionMode, visibleRootOrderKey]);

  const changeSelectedRoot = (
    threadId: string,
    intent: RootSelectionIntent,
  ) => {
    setBulkMessage(null);
    setBulkOutcomes([]);
    const update = applyRootSelection({
      selectedRootIds,
      visibleEligibleRootIds: renderedSelectableRootIds(inboxRef.current),
      anchorRootId: selectionAnchorRootId.current,
      targetRootId: threadId,
      targetSelected: intent.selected,
      shiftKey: intent.shiftKey,
    });
    selectionAnchorRootId.current = update.anchorRootId;
    setSelectedRootIds(update.selectedRootIds);
  };

  const commitFamilyOrder = (
    projectId: string,
    rootIds: readonly string[],
    announcement: string,
  ) => {
    void order
      .reorderFamilies(projectId, rootIds)
      .then((ok) =>
        setReorderAnnouncement(
          ok ? announcement : "Thread family order could not be saved.",
        ),
      )
      .catch(() =>
        setReorderAnnouncement("Thread family order could not be saved."),
      );
  };

  const projectOrderInputs = (projectId: string) => {
    const group = unfilteredProjectGroups.find(
      (candidate) => candidate.project.id === projectId,
    );
    if (group === undefined) return null;
    return {
      rootIds: group.families.map((family) => family.root.id),
      pinnedRootIds: group.families
        .filter((family) => family.root.isPinned)
        .map((family) => family.root.id),
    };
  };

  const announceRejectedMove = (result: FamilyMoveResult) => {
    if (result.ok) return;
    const messages: Record<Exclude<FamilyMoveResult, { ok: true }>["reason"], string> = {
      "cross-project": "Thread families cannot move between projects.",
      "incomplete-order": "Reordering requires the complete project order.",
      "invalid-id": "That reorder request was invalid.",
      "missing-root": "That thread family cannot move farther in this direction.",
      "pinned-boundary": "Pinned and unpinned thread families cannot cross.",
      "same-root": "Thread family order did not change.",
    };
    setReorderAnnouncement(messages[result.reason]);
  };

  /**
   * The project's worktrees as rows, in the order they are drawn.
   *
   * Taken from every thread the project has rather than from what is on screen:
   * a reorder has to write the complete arrangement, or a row hidden by search
   * would drop out of it. The checkout is not in the list, because it leads
   * under every arrangement and there is nothing to move.
   */
  const workspaceOrderInputs = (projectId: string) => {
    const group = unfilteredProjectGroups.find(
      (candidate) => candidate.project.id === projectId,
    );
    if (group === undefined) return null;
    const refs = new Map<string, WorkspaceRef>();
    for (const family of group.families) {
      const ref = workspaceRefOf(
        family.root,
        new Map(Object.entries(paths.environments)),
        new Map(Object.entries(paths.projects)),
      );
      if (!refs.has(ref.key)) refs.set(ref.key, ref);
    }
    return {
      keys: orderWorkspaces(
        [...refs.values()].map((ref) => ({ ref })),
        order.workspaces[projectId],
      )
        .filter((workspace) => workspace.ref.kind === "git-worktree")
        .map((workspace) => workspace.ref.key),
    };
  };

  const commitWorkspaceOrder = (
    projectId: string,
    keys: readonly string[],
    announcement: string,
  ) => {
    void order
      .reorderWorkspaces(projectId, keys)
      .then((ok) =>
        setReorderAnnouncement(
          ok ? announcement : "Worktree order could not be saved.",
        ),
      )
      .catch(() =>
        setReorderAnnouncement("Worktree order could not be saved."),
      );
  };

  const announceRejectedWorkspaceMove = (result: WorkspaceMoveResult) => {
    if (result.ok) return;
    const messages: Record<
      Exclude<WorkspaceMoveResult, { ok: true }>["reason"],
      string
    > = {
      "cross-project": "Worktrees cannot move between projects.",
      "invalid-id": "That reorder request was invalid.",
      "missing-workspace": "That worktree cannot move farther in this direction.",
      "same-workspace": "Worktree order did not change.",
    };
    setReorderAnnouncement(messages[result.reason]);
  };

  const reorderWorkspaceByDrag = (input: {
    sourceProjectId: string;
    sourceKey: string;
    targetProjectId: string;
    targetKey: string;
    position: "before" | "after";
  }) => {
    // A drag that lands on the row it started from is the click that drifted
    // into one. The browser starts a drag after about five pixels of movement
    // and then produces no click at all, so a press with a little wobble in it
    // opened nothing and only announced that the order had not changed;
    // measured on the running app, a click that travelled nine pixels fired
    // `dragstart`, dropped on its own row, and toggled nothing. Toggle it here,
    // which is what the press was for.
    if (
      input.sourceProjectId === input.targetProjectId &&
      input.sourceKey === input.targetKey
    ) {
      viewStateApi.setWorkspaceExpanded(
        input.targetKey,
        !viewStateApi.isWorkspaceExpanded(input.targetKey),
      );
      return;
    }
    if (!workspaceReorderEnabled) {
      setReorderAnnouncement(
        workspaceReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const project = workspaceOrderInputs(input.targetProjectId);
    if (project === null) {
      setReorderAnnouncement("That project is no longer available.");
      return;
    }
    const result = moveProjectWorkspace({
      projectId: input.targetProjectId,
      ...input,
      keys: project.keys,
    });
    if (!result.ok) {
      announceRejectedWorkspaceMove(result);
      return;
    }
    commitWorkspaceOrder(
      input.targetProjectId,
      result.keys,
      "Moved worktree.",
    );
  };

  const reorderWorkspaceByKeyboard = (
    projectId: string,
    workspaceKey: string,
    direction: -1 | 1,
  ) => {
    if (!workspaceReorderEnabled) {
      setReorderAnnouncement(
        workspaceReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const project = workspaceOrderInputs(projectId);
    if (project === null) return;
    const result = keyboardWorkspaceMove(
      projectId,
      project.keys,
      workspaceKey,
      direction,
    );
    if (!result.ok) {
      announceRejectedWorkspaceMove(result);
      return;
    }
    commitWorkspaceOrder(
      projectId,
      result.keys,
      `Moved worktree ${direction < 0 ? "up" : "down"}.`,
    );
  };

  const reorderByDrag = (input: {
    sourceProjectId: string;
    sourceRootId: string;
    targetProjectId: string;
    targetRootId: string;
    position: "before" | "after";
  }) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(
        familyReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const project = projectOrderInputs(input.targetProjectId);
    if (project === null) {
      setReorderAnnouncement("That project is no longer available.");
      return;
    }
    const result = moveProjectFamily({
      projectId: input.targetProjectId,
      ...input,
      ...project,
    });
    if (!result.ok) {
      announceRejectedMove(result);
      return;
    }
    commitFamilyOrder(
      input.targetProjectId,
      result.order,
      `Moved ${rootTitleById.get(input.sourceRootId) ?? "thread family"}.`,
    );
  };

  const reorderByKeyboard = (
    projectId: string,
    rootId: string,
    direction: -1 | 1,
  ) => {
    if (!reorderEnabled) {
      setReorderAnnouncement(
        familyReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const project = projectOrderInputs(projectId);
    if (project === null) return;
    const result = keyboardFamilyMove(
      projectId,
      project.rootIds,
      project.pinnedRootIds,
      rootId,
      direction,
    );
    if (!result.ok) {
      announceRejectedMove(result);
      return;
    }
    commitFamilyOrder(
      projectId,
      result.order,
      `Moved ${rootTitleById.get(rootId) ?? "thread family"} ${direction < 0 ? "up" : "down"}.`,
    );
  };

  const commitProjectOrder = (
    groupId: string,
    projectIds: readonly string[],
    announcement: string,
  ) => {
    void order
      .reorderProjects(groupId, projectIds)
      .then((ok) =>
        setReorderAnnouncement(
          ok ? announcement : "Project order could not be saved.",
        ),
      )
      .catch(() => setReorderAnnouncement("Project order could not be saved."));
  };

  const announceRejectedProjectMove = (result: ProjectMoveResult) => {
    if (result.ok) return;
    const messages: Record<Exclude<ProjectMoveResult, { ok: true }>["reason"], string> = {
      "incomplete-order": "Project reordering requires the complete group order.",
      "invalid-id": "That project reorder request was invalid.",
      "missing-project": "That project cannot move farther in this direction.",
      "same-project": "Project order did not change.",
    };
    setReorderAnnouncement(messages[result.reason]);
  };

  const reorderProjectByDrag = (input: {
    sourceProjectId: string;
    targetProjectId: string;
    position: "before" | "after";
  }) => {
    // A header dropped on itself is the click that drifted into a drag — see
    // `reorderWorkspaceByDrag` for the measurement and the reasoning.
    if (input.sourceProjectId === input.targetProjectId) {
      viewStateApi.setProjectCollapsed(
        input.targetProjectId,
        !viewStateApi.isProjectCollapsed(input.targetProjectId),
      );
      return;
    }
    if (!projectReorderEnabled) {
      setReorderAnnouncement(
        projectReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const sourceScope = projectOrderScope(
      groupsApi.assignment,
      input.sourceProjectId,
    );
    const targetScope = projectOrderScope(
      groupsApi.assignment,
      input.targetProjectId,
    );
    // A project belongs to one group, and the order is stored per group; a
    // cross-group drop would be two decisions at once. Membership has its own
    // command in the row menu, so the drag stays a pure reorder.
    if (sourceScope !== targetScope) {
      setReorderAnnouncement(
        "Projects can only be reordered within their group. Use Move to group to change groups.",
      );
      return;
    }
    const result = moveProject({
      projectIds: orderedProjectIds(
        unfilteredProjectGroups,
        groupsApi.assignment,
        sourceScope,
      ),
      ...input,
    });
    if (!result.ok) {
      announceRejectedProjectMove(result);
      return;
    }
    commitProjectOrder(sourceScope, result.order, "Moved project.");
  };

  const reorderProjectByKeyboard = (projectId: string, direction: -1 | 1) => {
    if (!projectReorderEnabled) {
      setReorderAnnouncement(
        projectReorderDisabledReason ?? "Reordering is unavailable.",
      );
      return;
    }
    const scope = projectOrderScope(groupsApi.assignment, projectId);
    const result = keyboardProjectMove(
      orderedProjectIds(unfilteredProjectGroups, groupsApi.assignment, scope),
      projectId,
      direction,
    );
    if (!result.ok) {
      announceRejectedProjectMove(result);
      return;
    }
    const projectName = unfilteredProjectGroups.find(
      (group) => group.project.id === projectId,
    )?.project.name;
    commitProjectOrder(
      scope,
      result.order,
      `Moved ${projectName ?? "project"} ${direction < 0 ? "up" : "down"}.`,
    );
  };

  /**
   * A project header dropped onto another project header. The target decides
   * before/after from the pointer's half of the row; the move itself is the
   * same project order the keyboard path writes.
   */
  const reorderProjectDrop = (
    sourceProjectId: string,
    targetProjectId: string,
    position: "before" | "after",
  ) => {
    reorderProjectByDrag({ sourceProjectId, targetProjectId, position });
  };

  const selectAllVisible = () => {
    selectionAnchorRootId.current = null;
    setBulkMessage(null);
    setBulkOutcomes([]);
    setSelectedRootIds((current) =>
      new Set([...current, ...selectableVisibleRootIds]),
    );
  };

  const cancelSelection = () => {
    selectionAnchorRootId.current = null;
    setSelectedRootIds(new Set());
    setSelectionMode(false);
    setBulkPreview(null);
    setBulkMessage(null);
    setBulkOutcomes([]);
  };

  const previewSelectedDeletion = async () => {
    if (selectedRootIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setBulkMessage(null);
    setBulkOutcomes([]);
    try {
      const preview = await rpc.call("previewBulkDelete", {
        threadIds: [...selectedRootIds],
        protectedThreadId: activeThreadId,
      });
      if (preview.token === null) {
        setBulkMessage(
          `${preview.skipped.length} selected ${preview.skipped.length === 1 ? "family is" : "families are"} protected. Nothing can be deleted.`,
        );
        setBulkOutcomes(
          preview.skipped.map((entry) => ({
            id: entry.id,
            message: entry.message,
            failed: false,
          })),
        );
      } else {
        setBulkPreview(preview);
      }
    } catch (error) {
      setBulkMessage(errorMessage(error));
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmSelectedDeletion = async () => {
    const preview = bulkPreview;
    if (preview?.token == null || bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await rpc.call("confirmBulkDelete", {
        token: preview.token,
      });
      const remaining = new Set(selectedRootIds);
      for (const threadId of result.deleted) remaining.delete(threadId);
      setSelectedRootIds(remaining);
      selectionAnchorRootId.current = null;
      setBulkPreview(null);
      const skippedCount = preview.skipped.length + result.skipped.length;
      setBulkOutcomes([
        ...preview.skipped.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: false,
        })),
        ...result.skipped.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: false,
        })),
        ...result.failed.map((entry) => ({
          id: entry.id,
          message: entry.message,
          failed: true,
        })),
      ]);
      const summary = [
        result.deleted.length > 0
          ? `Deleted ${result.deleted.length}.`
          : "Deleted none.",
        skippedCount > 0 ? `${skippedCount} protected.` : "",
        result.failed.length > 0 ? `${result.failed.length} failed.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      setBulkMessage(summary);
      if (remaining.size === 0) setSelectionMode(false);
    } catch (error) {
      setBulkPreview(null);
      setBulkMessage(errorMessage(error));
      setBulkOutcomes([]);
    } finally {
      setBulkBusy(false);
    }
  };

  /**
   * Every new-thread entry on a row opens the same dialog, so the sidebar has
   * one answer to "where does a new thread start" instead of two.
   *
   * A project row has no worktree to seed — the composer's own environment
   * picker is where that is chosen — but the surface stays the one the
   * workspace rows use, and `+` means the same thing on every row.
   */
  function seedFromProject(projectId: string, projectName: string) {
    setNewThreadSeed({ projectId, projectName, originLabel: projectName });
  }

  /**
   * "New worktree" seeds a fresh managed worktree.
   *
   * bb has no standalone "create environment" call — an environment comes into
   * being when a thread spawns into it — so creating a worktree and creating a
   * thread are one action by construction. The dialog is where that happens,
   * with the branch and base still the user's to choose.
   *
   * Unlike a workspace row's seed this one is not settled on submit: it is an
   * instruction to create rather than a reference to something that already
   * exists, so the branch picker stays the user's to change.
   *
   * `hostId` is not optional in practice even though the contract marks it so:
   * the composer resolves a `host` seed with no host to `null` and silently
   * falls back to the project's default, which is how this seed used to arrive
   * as a plain project checkout. The project's source host is the machine the
   * worktree belongs on.
   */
  function seedNewWorktree(projectId: string, projectName: string) {
    const hostId = paths.projects[projectId]?.sourceHostId ?? null;
    setNewThreadSeed({
      projectId,
      projectName,
      environment:
        hostId === null
          ? undefined
          : {
              type: "host",
              hostId,
              workspace: {
                type: "managed-worktree",
                baseBranch: { kind: "default" },
              },
            },
      // With no source host there is no worktree seed either, so the header
      // says where this actually came from rather than naming a worktree that
      // was never asked for.
      originLabel:
        hostId === null ? projectName : `New worktree in ${projectName}`,
    });
  }

  /**
   * A workspace row seeds the worktree it belongs to, and the dialog submits
   * that exact environment rather than trusting the composer to keep it.
   *
   * It cannot be handed to `openNewThread`: that shortcut accepts only a
   * project and a focus flag, so the worktree would be dropped and the thread
   * would land in a brand-new worktree instead. The composer's own environment
   * picker is no substitute either — its "reuse an existing environment" list
   * is built by grouping *threads*, so a worktree whose threads have all been
   * archived is simply absent from it, and a `reuse` seed the list does not
   * contain is dropped without an error. Starting a thread in a worktree that
   * has no threads left is exactly the case this row exists for, which is why
   * the dialog owns both the seed and the environment it finally submits.
   */
  function seedFromWorkspace({ node, projectId, projectName }: WorkspaceLaunch) {
    const environment =
      node.ref.environmentId === null
        ? undefined
        : ({ type: "reuse", environmentId: node.ref.environmentId } as const);
    setNewThreadSeed({
      projectId,
      projectName,
      environment,
      originLabel:
        environment === undefined
          ? `Seeded from ${projectName}`
          : `${projectName} → ${node.ref.label}`,
    });
  }

  /**
   * Filing a project is one field, so it has no local echo: the store
   * publishes and the tree re-reads, which keeps a failed write from leaving
   * the sidebar showing a membership the database never took.
   */
  const assignGroup = (projectId: string, groupId: string | null) => {
    void rpc
      .call("assignProjectToGroup", { projectId, groupId })
      .then(() => groupsApi.refresh())
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /** Rename a group from its row. The store publishes, the tree re-reads. */
  const renameGroup = (groupId: string, name: string) => {
    void rpc
      .call("renameGroup", { groupId, name })
      .then(() => groupsApi.refresh())
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /**
   * Delete a group from its row. bb's own section menu removes without a
   * second dialog because a section is not its contents; a group here releases
   * its projects to Ungrouped rather than deleting them, so the same applies.
   */
  const removeGroup = (groupId: string) => {
    void rpc
      .call("deleteGroup", { groupId })
      .then(() => groupsApi.refresh())
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /**
   * Move a group one slot through the explicit order the store persists.
   * `reorderGroups` wants the whole list, so the new order is built here and
   * sent complete rather than as a delta.
   */
  const moveGroup = (groupId: string, delta: -1 | 1) => {
    const ids = groupsApi.groups.map((group) => group.id);
    const from = ids.indexOf(groupId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, groupId);
    void rpc
      .call("reorderGroups", { groupIds: next })
      .then(() => groupsApi.refresh())
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /** A project renamed from its row menu; bb owns the name, we forward it. */
  const renameProject = (projectId: string, name: string) => {
    void rpc
      .call("renameProject", { projectId, name })
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /** A worktree alias. bb stores it on the environment, so it survives regroups. */
  const renameWorktree = (environmentId: string, name: string) => {
    void rpc
      .call("renameEnvironment", { environmentId, name })
      .catch((error) => setReorderAnnouncement(errorMessage(error)));
  };

  /** Fold every group and project, so the tree collapses to its headers. */
  const collapseAll = () => {
    patchViewState({
      collapsedGroups: [
        ...groupsApi.groups.map((group) => group.id),
        UNGROUPED_SCOPE_KEY,
      ],
      collapsedProjects: unfilteredProjectGroups.map(
        (group) => group.project.id,
      ),
    });
  };

  /** Back to the default view: no filter, both orders read the manual list. */
  const resetView = () => {
    patchViewState({ filter: "all" });
    viewPreferences.setProjectSort("manual");
    viewPreferences.setThreadSort("manual");
  };

  const treeHandlers: TreeRowHandlers = {
    providerInfoById,
    paths,
    activeThreadId,
    forceExpanded: searching,
    lifecycle,
    onNavigate,
    now,
    selectionMode,
    selectedRootIds,
    selectionHintId,
    onToggleRoot: changeSelectedRoot,
    onNewThreadInWorkspace: seedFromWorkspace,
    preferences,
    reorderEnabled,
    reorderDisabledReason: familyReorderDisabledReason,
    onReorder: reorderByDrag,
    onKeyboardMove: reorderByKeyboard,
    workspaceReorderEnabled,
    workspaceReorderDisabledReason,
    onWorkspaceReorder: reorderWorkspaceByDrag,
    onWorkspaceKeyboardMove: reorderWorkspaceByKeyboard,
    projectReorderEnabled,
    projectReorderDisabledReason,
    onProjectReorder: reorderProjectByDrag,
    onProjectKeyboardMove: reorderProjectByKeyboard,
    onGroupMove: moveGroup,
    onRenameGroup: renameGroup,
    onRemoveGroup: removeGroup,
    onRenameProject: renameProject,
    onRenameWorktree: renameWorktree,
  };

  return (
    <NestViewStateProvider value={viewStateApi}>
    <div
      ref={inboxRef}
      data-nest-palette={preferences.palettePreset}
      data-nest-density={preferences.density}
      style={nestPreferenceStyle(preferences) as CSSProperties}
      className="flex min-h-0 flex-1 flex-col"
    >
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {reorderAnnouncement}
      </output>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {copyAnnouncement}
      </output>
      <div className="shrink-0">
        <GroupTabs
          tabs={groupTabs}
          activeKey={activeScopeKey}
          onSelect={(scope) =>
            patchViewState({ scope: groupScopeKey(scope) })
          }
          onManage={() => setGroupManagerOpen(true)}
        >
          {selectionMode ? null : (
            <ViewMenu
              filter={filterPreset}
              onFilterChange={(filter) => patchViewState({ filter })}
              projectSort={viewPreferences.projectSort}
              onProjectSortChange={viewPreferences.setProjectSort}
              threadSort={viewPreferences.threadSort}
              onThreadSortChange={viewPreferences.setThreadSort}
              worktreeSort={viewPreferences.worktreeSort}
              onWorktreeSortChange={viewPreferences.setWorktreeSort}
              onCollapseAll={collapseAll}
              onResetView={resetView}
            />
          )}
          <button
            type="button"
            aria-label={
              selectionMode ? "Thread selection active" : "Select threads"
            }
            title={selectionMode ? "Thread selection active" : "Select threads"}
            disabled={selectionMode}
            data-bb-icon-button=""
            onClick={() => {
              selectionAnchorRootId.current = null;
              setSelectionMode(true);
              setBulkMessage(null);
              setBulkOutcomes([]);
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-sidebar-accent focus-visible:text-foreground disabled:opacity-50",
              selectionMode && "bg-primary/10 text-primary",
            )}
          >
            <Icon name="ListTodo" className="size-3.5" aria-hidden />
          </button>
        </GroupTabs>

        {selectionMode ? (
          <div className="flex h-8 items-center gap-1 border-y border-sidebar-border/70 px-2 text-2xs">
            <span id={selectionHintId} className="sr-only">
              Use Shift+click on another checkbox to select or deselect a range.
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {selectedRootIds.size} selected
            </span>
            <button
              type="button"
              disabled={selectableVisibleRootIds.length === 0}
              title={`${Math.max(0, visibleRootCount - selectableVisibleRootIds.length)} visible protected`}
              onClick={selectAllVisible}
              className="h-6 rounded px-1.5 font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              All
            </button>
            <button
              type="button"
              disabled={selectedRootIds.size === 0}
              onClick={() => {
                selectionAnchorRootId.current = null;
                setSelectedRootIds(new Set());
                setBulkMessage(null);
                setBulkOutcomes([]);
              }}
              className="h-6 rounded px-1.5 font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              aria-label={`Delete ${selectedRootIds.size} selected thread families`}
              title="Delete selected permanently"
              disabled={selectedRootIds.size === 0 || bulkBusy}
              data-bb-icon-button=""
              onClick={() => void previewSelectedDeletion()}
              className="flex size-6 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              <Icon
                name={bulkBusy ? "Loading" : "Trash"}
                className={cn("size-3.5", bulkBusy && "animate-spin")}
                aria-hidden
              />
            </button>
            <button
              type="button"
              aria-label="Cancel thread selection"
              title="Cancel selection"
              disabled={bulkBusy}
              data-bb-icon-button=""
              onClick={cancelSelection}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            >
              <Icon name="CircleX" className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : null}

        {bulkMessage || bulkOutcomes.length > 0 ? (
          <div className="border-b border-sidebar-border/70 px-2.5 py-1 text-2xs leading-snug text-muted-foreground">
            {bulkMessage ? (
              <output aria-live="polite">{bulkMessage}</output>
            ) : null}
            {bulkOutcomes.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5" aria-label="Bulk delete outcomes">
                {bulkOutcomes.map((outcome) => (
                  <li
                    key={`${outcome.id}:${outcome.message}`}
                    className={cn(
                      "truncate",
                      outcome.failed && "text-destructive",
                    )}
                    title={`${rootTitleById.get(outcome.id) ?? outcome.id}: ${outcome.message}`}
                  >
                    <span className="font-medium text-foreground/80">
                      {rootTitleById.get(outcome.id) ?? outcome.id}
                    </span>
                    {`: ${outcome.message}`}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/*
        The bar's lane is reserved, and the padding is not a stand-in for it.

        A scrollbar is laid out between the padding box and the border, so it
        is taken out of the content box and never out of the padding. Padding
        therefore cannot absorb one: rows are full width, so the moment the bar
        appears every row narrows by the bar's width and everything pinned to a
        row's right edge — the trailing glyphs, the disclosure chevron, the
        menu — jumps left. `scrollbar-gutter: stable` keeps the content box at
        one width whether or not the bar is showing, so nothing moves. What is
        left on the right is the bar's own lane plus a small gap, which is why
        the padding is a token step rather than the roomier inset it used to
        be: with the lane reserved, a wide padding just reads as a dead margin.

        `overflow-y: auto` computes `overflow-x` to `auto`, so a single pixel
        of horizontal overflow used to grow a horizontal bar, which then ate
        its own strip of height and fed back into the vertical one. `overflow-x:
        clip` ends that whole class of failure. Decorations that used to poke
        past the right edge — the status, pull-request and provider tooltips —
        are bounded by the row they hang off instead, which is what those rows'
        `@container` is for.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-clip pl-1.5 pr-0.5 pb-2 [scrollbar-gutter:stable]">
        {status === "loading" ? null : status === "error" ? (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          <p role="status" className={EMPTY_STATE_CLASS}>
            Could not load threads.
          </p>
        ) : !lifecycle.shelvesReady ? null : visibleTotal === 0 ? (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          <p role="status" className={EMPTY_STATE_CLASS}>
            {searching ? "No threads found" : "No threads yet"}
          </p>
        ) : (
          <>
            {treeNodes.map((node) => (
              <GroupSection
                key={node.groupId ?? "__ungrouped__"}
                node={node}
                handlers={treeHandlers}
                groups={groupsApi.groups}
                onAssignGroup={assignGroup}
                onNewThreadInProject={seedFromProject}
                onNewWorktree={seedNewWorktree}
                onNewThreadInWorkspace={seedFromWorkspace}
                projectColorOverrides={projectColorOverrides}
                projectIcons={projectIcons}
                projectReorder={{
                  enabled: projectReorderEnabled,
                  next: reorderProjectByKeyboard,
                  drop: reorderProjectDrop,
                }}
              />
            ))}
            {showParkedShelves ? (
              <>
                <ParkedShelf
                  label="Snoozed"
                  threads={snoozed}
                  expanded={showSnoozed}
                  onToggle={() =>
                    patchViewState({ snoozedOpen: !showSnoozed })
                  }
                  shelf="snoozed"
                  activeThreadId={activeThreadId}
                  lifecycle={lifecycle}
                  onNavigate={onNavigate}
                  now={now}
                />
                <ParkedShelf
                  label="Settled"
                  threads={settled}
                  pendingCount={pendingSettled}
                  expanded={showSettled}
                  onToggle={() =>
                    patchViewState({ settledOpen: !showSettled })
                  }
                  shelf="settled"
                  activeThreadId={activeThreadId}
                  lifecycle={lifecycle}
                  onNavigate={onNavigate}
                  now={now}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      <BulkDeleteDialog
        open={bulkPreview !== null}
        preview={bulkPreview}
        busy={bulkBusy}
        onCancel={() => setBulkPreview(null)}
        onConfirm={() => void confirmSelectedDeletion()}
      />

    <GroupManagerDialog
      open={groupManagerOpen}
      groups={groupsApi.groups}
      icons={groupsApi.icons}
      onClose={() => setGroupManagerOpen(false)}
    />

    <NewThreadDialog
      seed={newThreadSeed}
      onClose={() => setNewThreadSeed(null)}
      onCreated={(threadId) => {
        setNewThreadSeed(null);
        setPendingOpenId(threadId);
      }}
    />

    </div>
    </NestViewStateProvider>
  );
}

function ParkedShelf({
  label,
  threads,
  pendingCount = 0,
  expanded,
  onToggle,
  shelf,
  activeThreadId,
  lifecycle,
  onNavigate,
  now,
}: {
  label: string;
  threads: readonly PluginSidebarThread[];
  pendingCount?: number;
  expanded: boolean;
  onToggle: () => void;
  shelf: "snoozed" | "settled";
  activeThreadId: string | null;
  lifecycle: ReturnType<typeof useLifecycle>;
  onNavigate: () => void;
  now: number;
}) {
  const count = threads.length + pendingCount;
  if (count === 0) return null;
  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 flex w-full cursor-pointer items-center gap-2 px-2.5 pb-1 text-left"
      >
        <span className="text-2xs font-medium text-muted-foreground/70">
          {expanded ? label : `${label} (${count})`}
        </span>
        <span className="h-px flex-1 bg-sidebar-border" />
        <span className={TRAILING_GLYPH_BOX_CLASS}>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 text-muted-foreground/70 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-px">
          {threads.map((thread) => (
            <SlimRow
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              shelf={shelf}
              wakeAt={lifecycle.wakeAtFor(thread)}
              now={now}
              onNavigate={onNavigate}
              onRestore={() =>
                shelf === "snoozed"
                  ? lifecycle.unsnooze(thread.id)
                  : lifecycle.unsettle(thread.id)
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function renderedSelectableRootIds(root: HTMLDivElement | null): string[] {
  if (root === null) return [];
  return Array.from(
    root.querySelectorAll<HTMLInputElement>(
      "input[data-nest-select-root]:not(:disabled)",
    ),
  ).flatMap((input) => {
    const rootId = input.dataset.nestSelectRoot;
    return rootId && input.getClientRects().length > 0 ? [rootId] : [];
  });
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  return [...left].every((value) => right.has(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "string" &&
    error.error.trim()
  ) {
    return error.error;
  }
  return "Could not update the selected threads.";
}
