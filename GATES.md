# Gates: project-first rendering

OWNS: lib/inbox.ts, lib/tree.ts, lib/workspace.ts, components/inbox/project-node.tsx, components/inbox/thread-inbox.tsx, test/**, README.md, PLAN.md, GATES.md

Scope: render every project bb reports as a sidebar node, with its workspaces under it, so a project with no visible thread is still reachable; keep the workspace and thread levels unchanged; leave no dead path behind.

- [x] G1: a project with no threads produces a project group with empty families, in bb's project order
  CHECK: node --test --experimental-strip-types --test-name-pattern='project thread groups' test/inbox.test.ts
  EXPECT: project-first seeding verified
  EVIDENCE: 'lists every project bb reports, with an empty body when it has no threads' asserts the group order and the empty families array; 'files a thread whose project is not listed after the known ones' covers the stray-project tail; the four pre-existing grouping tests still pass unchanged.

- [x] G2: the flat-list helpers the nested tree replaced are gone, and nothing references them
  CHECK: rg -n 'filterByProject|partitionPinned|hideChildrenOfVisibleParents|ProjectScope|groupThreadsByProject|visibleTotal|activeVisibleCount' lib components hooks server.ts app.tsx host.ts test
  EXPECT: no matches
  EVIDENCE: no matches on 2026-09-19. lib/inbox.ts went from 287 to 248 lines.

- [x] G3: the plugin typechecks and builds
  CHECK: npm run typecheck && npm run build
  EXPECT: project-first build passed
  EVIDENCE: both passed on 2026-09-19 (dist/server.js, dist/app.js, dist/host.js written).

- [x] G4: the complete test suite passes
  CHECK: npm test
  EXPECT: project-first test suite passed
  EVIDENCE: 420 tests, 103 suites, 0 failures on 2026-09-19.

- [x] G5: in the running app the zero-thread project bb-plugins appears in the sidebar with a placeholder body, and a zero-thread project draws its workspace level
  EVIDENCE: on 2026-09-19 the plugin was reloaded and the running UI was driven at http://127.0.0.1:38886. The tree reads All | My | Work | Ungrouped; Ungrouped contains bb-plugins with the 'No threads yet' placeholder, and pi-maestro-flow (0 threads) draws its 'master' workspace row. 日常聊天 still draws Project checkout and bb under it.
  NOTE: the same rule was exercised against the live payload outside the browser (lib/inbox.ts -> lib/ordering.ts -> lib/tree.ts over /api/v1/sidebar-bootstrap plus the plugin's own listWorkspacePaths), which is what a freshly created worktree in an empty project would go through.

- [x] G6: a worktree that has never held a thread still draws, and can still be arranged
  CHECK: node --test --experimental-strip-types --test-name-pattern='projectWorkspaceRefs' test/workspace-environments.test.ts
  EXPECT: thread-less worktrees named
  EVIDENCE: the arrangement was built from the project's threads, so it named nothing for a project with worktrees and no threads and then refused the move as "missing-workspace". projectWorkspaceRefs is now the one source for both the drawn rows and the arrangement; unit-tested, and checked against the live environment descriptors with two synthetic thread-less worktrees added to proj_i2excbt33u (both draw, both arrange).
