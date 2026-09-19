import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const modal = await readFile(new URL("../components/ui/modal.tsx", import.meta.url), "utf8");
const inbox = await readFile(new URL("../components/inbox/thread-inbox.tsx", import.meta.url), "utf8");
const newThread = await readFile(new URL("../components/inbox/new-thread-dialog.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../components/ui/menu.tsx", import.meta.url), "utf8");
const hoverCard = await readFile(new URL("../components/ui/hover-card.tsx", import.meta.url), "utf8");
const select = await readFile(new URL("../components/ui/select.tsx", import.meta.url), "utf8");
const groupManager = await readFile(new URL("../components/inbox/group-manager-dialog.tsx", import.meta.url), "utf8");
const portalScope = await readFile(new URL("../lib/portal-scope.ts", import.meta.url), "utf8");

describe("modal and overlay contracts", () => {
  /**
   * One surface for every row. A project row seeds a project, a workspace row
   * seeds the worktree it names, and "New worktree" seeds a fresh one; the
   * sidebar's own `openNewThread` shortcut is gone, because it accepts a project
   * and a focus flag and nothing else — a worktree handed to it is dropped.
   */
  it("routes every row's new-thread action through the seeded dialog", () => {
    assert.match(inbox, /<NewThreadDialog/);
    // The prose still names the shortcut it explains why not to use, so this
    // asserts on the call rather than on the word.
    assert.doesNotMatch(inbox, /sidebarActions\.openNewThread/);
    assert.match(inbox, /type: "reuse", environmentId: node\.ref\.environmentId/);
    assert.match(inbox, /type: "managed-worktree"/);
    assert.match(inbox, /baseBranch: \{ kind: "default" \}/);
    // A `host` seed with no host resolves to null inside the composer, so the
    // project's source host has to travel with it.
    assert.match(inbox, /sourceHostId/);
  });

  /**
   * Only a worktree the user named is settled on submit, because only a `reuse`
   * seed can be dropped by the composer — its "reuse an existing environment"
   * list is built from threads, so a worktree whose threads have all been
   * archived is absent from it. A project seed and a new-worktree seed belong to
   * the composer's own pickers.
   */
  it("settles a workspace row's environment on submit, and only that one", () => {
    assert.match(newThread, /seed\.environment\?\.type === "reuse"/);
    assert.match(newThread, /environment: reused/);
  });

  /**
   * `sidebarActions.open` silently ignores an id the host's client store does
   * not hold, and a spawn answers before the sidebar's read catches up — so
   * opening on the spot leaves the user on the composer. The row must wait for
   * the thread to arrive in the sidebar's own live view.
   */
  it("waits for the sidebar to hold a spawned thread before opening it", () => {
    assert.match(inbox, /setPendingOpenId\(threadId\)/);
    assert.doesNotMatch(inbox, /sidebarActions\.open\(threadId\)/);
    assert.match(inbox, /hostThreads\.some\(\(thread\) => thread\.id === pendingOpenId\)/);
  });

  /**
   * The spawn path was the last route into a thread that skipped `onNavigate`.
   * On a phone that left the drawer open over the thread the user had just
   * created, which is the one moment the sidebar is certainly done with.
   */
  it("closes the mobile drawer on the spawn path too", () => {
    assert.match(
      inbox,
      /sidebarActions\.open\(pendingOpenId\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*onNavigate\(\);/,
    );
  });

  it("uses the official BB dialog instead of a native dialog", () => {
    assert.match(modal, /from "@\/components\/ui\/dialog"/);
    assert.match(modal, /<Dialog[\s\S]*<DialogContent/);
    assert.match(modal, /aria-label="Close"/);
    assert.doesNotMatch(modal, /<dialog/);
    assert.doesNotMatch(modal, /showModal\(\)/);
  });

  it("keeps floating surfaces in the official portal path", () => {
    assert.match(groupManager, /from "@\/components\/ui\/popover"/);
    assert.doesNotMatch(groupManager, /@radix-ui\/react-popover/);
    assert.doesNotMatch(groupManager, /useOverlayPortalContainer/);
    assert.doesNotMatch(groupManager, /Popover\.Portal/);
    assert.match(menu, /container=\{container\}/);
    assert.match(hoverCard, /container=\{container\}/);
    assert.match(select, /container=\{useOverlayPortalContainer\(\)\}/);
    assert.match(portalScope, /data-bb-portaled-overlay/);
  });
});
