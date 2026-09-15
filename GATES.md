# Gates: workspace identity refactor

OWNS: lib/workspace.ts, lib/workspace-identity.ts, lib/tree.ts, components/inbox/tree-rows.tsx, components/inbox/project-node.tsx, hooks/use-workspace-paths.ts, server.ts, test/**, README.md, PLAN.md, GATES.md

Scope: classify and render project workspaces by physical identity and project relationship, while preserving environment-backed actions and handling ambiguous or unavailable metadata safely.

- [x] G1: workspace identity classification covers project checkout, same-repository worktree, external checkout, external directory, personal, missing, and duplicate-environment cases
  CHECK: npm test -- --test-name-pattern='workspace identity|workspace label|tree'
  EXPECT: workspace identity verification passed
  EVIDENCE: workspace-label tests cover path normalization, duplicate physical paths, classification changes, host mismatch, external checkout, collisions, unresolved metadata, and personal environments; full suite passed.

- [x] G2: the plugin typechecks and builds with the refactored workspace interface
  CHECK: npm run typecheck && npm run build
  EXPECT: workspace refactor build passed
  EVIDENCE: npm run typecheck and npm run build passed on 2026-09-15.

- [x] G3: the complete existing test suite passes
  CHECK: npm test
  EXPECT: workspace refactor test suite passed
  EVIDENCE: npm test passed with all tests green on 2026-09-15.

- [x] G4: runtime inspection confirms the affected project no longer represents a foreign checkout as an unqualified main checkout
  EVIDENCE: BB runtime on 2026-09-15 reports project source /Users/verger/code_source/front_end/chat_history and second environment /Users/verger/code_source/front_end/important_project/bb; the new rules classify them as Project checkout and External checkout respectively. No project/thread/environment data was changed.
