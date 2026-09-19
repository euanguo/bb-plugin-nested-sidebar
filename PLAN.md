# Plan: project-first rendering

Status: implemented and verified; see GATES.md.

## Goal

The sidebar renders **every project bb knows about**, with that project's workspaces
under it and its thread families under those. Today the project list is derived from
the threads that happen to be visible, so a project with no visible thread — a brand
new project, or one whose threads are all settled — does not exist on screen at all.

## Findings

bb already hands the sidebar every project. `GET /api/v1/sidebar-bootstrap` returns
`{ sections, projects, personalProject }`, and the projects array carries zero-thread
projects (`pi-maestro-flow`, `bb-plugins`) alongside populated ones. The SDK view
(`PluginSidebarThreadsState`) surfaces that as `{ status, threads, projects }`.

So no new data, no new RPC, and no server change is needed. The projects disappear in
one frontend function: `groupThreadsByProject` buckets threads by `projectId` and then
walks the *buckets*, so a project without threads never produces a node. Its `projects`
argument is only used to resolve names and ordering.

Everything below the project level is already project-first. `buildProjectNode` folds
in every environment of the project, not only the ones its threads occupy, and
`workspaceRefOfEnvironment` exists precisely for an environment with no thread behind
it. That path is live today: `env_erg3dfsmeu` (0 threads, project `proj_wiyzn7ium3`)
already draws as an External checkout row because that project has other threads.

Workspace metadata (path, branch, worktree-ness, provider) already reaches the client
through the plugin's own `listWorkspacePaths` RPC, which reads
`bb.sdk.environments.list()` and `bb.sdk.projects.list()`. Creating a worktree is
already offered on the project row ("New worktree" seeds a managed-worktree into bb's
own composer); the SDK has no `environments.create`, so a worktree is always created
as part of starting a thread.

## Design

1. **Seed the tree from projects.** `groupThreadsByProject` becomes
   `buildProjectGroups`: every project in the SDK's list opens a group, in bb's order,
   with `families` possibly empty. Threads are then filed into those groups. A thread
   whose project is not in the list still gets a group, appended after the known ones,
   as today.
2. **Give an empty project a body.** A project with no workspaces and no families
   renders one muted placeholder row instead of an empty list, so an expanded project
   never looks broken.
3. **Gate the global empty state on rendered rows, not on thread count.** The current
   `visibleTotal === 0` test counts threads, which would hide a project list that has
   no threads in it. It becomes a count of drawn tree nodes plus parked rows.
4. **Filters keep dropping projects with no matching threads.** A filter is a thread
   lens; the projects it leaves are the ones with something to show. This is existing
   behaviour and stays.
5. **The workspace level gains one case.** It appears when a project has more than one
   workspace, so a single-checkout project stays flat. It also appears when a project
   has no threads at all, where its single workspace is the only thing under it and a
   worktree that was just created would otherwise stay invisible until a second one
   existed.

## Changes

| File | Change |
| --- | --- |
| `lib/inbox.ts` | `groupThreadsByProject` -> `buildProjectGroups`, seeded from projects. Drop the flat-list leftovers `filterByProject`, `ProjectScope`, `partitionPinned`, `hideChildrenOfVisibleParents`, which nothing but their own tests used. |
| `lib/workspace.ts` | `shouldShowWorkspaces` takes the project's thread count, so one workspace is drawn while the project is empty. |
| `lib/tree.ts` | The thread count for that rule, and `projectWorkspaceRefs` — a project's complete workspace set — extracted so the worktree arrangement reads exactly the rows the tree draws. |
| `lib/thread-management.ts` | `includeSelectedFamilies` keeps a project that has no threads while the filter keeps it, so checking the first box in selection mode does not move the tree. |
| `components/inbox/project-node.tsx` | Placeholder row for a project with nothing under it, and no family drop target where a family could not land anyway. |
| `components/inbox/thread-inbox.tsx` | New call site, the row-based empty gate, and the arrangement built from `projectWorkspaceRefs`. |
| `test/inbox.test.ts` | Renamed subject, new seeding cases, removed tests for the dropped helpers. |
| `test/thread-management.test.ts`, `test/workspace-label.test.ts`, `test/workspace-environments.test.ts` | Renamed subject, and cases for the two rules and the arrangement. |
| `README.md` | One paragraph stating the model. |

## Found while reviewing the first pass

- The worktree arrangement was still built from the project's threads, so a
  project whose worktrees held no threads would have drawn them and then refused
  to move them. `projectWorkspaceRefs` is now the single source for both.
- `includeSelectedFamilies` dropped projects with no threads, so the tree shifted
  the moment the first box was checked in selection mode.
- A family dragged onto a project with no threads was accepted and then did
  nothing; the row no longer offers that drop.

## Non-goals

- No change to bb core, the SDK, or any persisted store shape.
- No standalone "create worktree" action: bb exposes none, so worktrees keep being
  created by the composer a thread starts from.
- No new setting for showing every project; that is the behaviour.

## Risks

- **Noise.** Every project ever created now holds a row. Accepted: that is what
  project-first means, and the group tabs and filters still scope the list.
- **A project whose threads are all parked shows as an empty project.** Correct and
  stable: the project did not go away, its threads are on the shelf below.
- **Cost.** `buildProjectNode` walks every environment per project. Negligible at the
  current ceiling (500 environments); worth an index if that ever grows.

## Verification

See `GATES.md`.
