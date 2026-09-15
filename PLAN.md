# Workspace identity refactor plan

## Acceptance contract

The sidebar must represent one physical workspace as one node, even when BB has multiple environment records for it. It must never label an arbitrary non-worktree environment as the project's main checkout. A project checkout is identified by its relationship to the project's configured source, not by a branch name or by workspaceDisplayKind alone. Different physical paths must remain distinct. Every merged node must retain all underlying environment IDs needed by row actions.

## Depth tree

### 1. Identity and classification seam

- Define a small, testable workspace identity module.
- Normalize paths conservatively and compare host plus physical path.
- Classify environments using project source metadata, Git relationship metadata when available, provider metadata, and explicit uncertainty states.
- Produce collision-safe display labels and retain environment IDs.

### 2. Data acquisition and integration

- Extend the server RPC used by the sidebar to return project source paths and environment descriptors.
- Keep the RPC bounded, tolerate missing environments and unavailable hosts, and avoid making UI guesses from partial DTOs.
- Adapt tree construction to consume descriptors and group thread families by stable workspace key.

### 3. UI and actions

- Render explicit workspace kinds and diagnostics for foreign, unresolved, and duplicate environments.
- Preserve new-thread, rename, copy, archive, remove, and navigation behavior through a canonical environment ID.
- Make collapsed state and ordering keys stable across environment recreation where possible.

### 4. Migration and verification

- Replace tests that require two rows solely because environment IDs differ.
- Add fixtures for same path, different path, same branch, different repository, missing path, and multiple environment IDs.
- Run focused tests, typecheck, build, full tests, and inspect the live affected project.

## Implementation status

The identity seam, descriptor RPC, tree integration, collision labels, action
gating, and legacy order lookup are implemented. The runtime case that exposed
the bug now resolves as:

- /Users/verger/code_source/front_end/chat_history -> Project checkout
- /Users/verger/code_source/front_end/important_project/bb -> External checkout

They remain two rows because they are two physical paths, while two environment
records for either one would be one row.

## Implementation order

1. Add pure identity types, normalization, classification, grouping, and label helpers.
2. Add server-side environment descriptors and project source data to the RPC.
3. Wire ThreadInbox and buildTree to the new descriptors.
4. Update workspace row actions and display to use the canonical descriptor.
5. Update order/view-state keys and compatibility handling.
6. Add/adjust tests and documentation.
7. Run gates and perform runtime verification against proj_wiyzn7ium3.

## Risks

- The app sidebar thread DTO does not include environment paths, so the server must be the authority for path data.
- Git relationship probing can be unavailable or expensive; classification must degrade to an explicit unresolved/external state rather than guessing main.
- Merging environments changes the workspace key used by persisted ordering and disclosure state; migration must preserve known order and discard only unresolvable obsolete keys.
- A merged workspace needs a selected canonical environment for actions while preserving the complete ID set for diagnostics and future operations.
