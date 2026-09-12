import { useId, useRef, useState, type DragEvent, type RefObject } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ThreadCard } from "@/components/inbox/thread-card";
import type { ProviderGlyphInfo } from "@/components/inbox/provider-glyph";
import { RollupJump } from "@/components/inbox/rollup-badge";
import { InfoCard, type InfoCardRow } from "@/components/ui/hover-card";
import {
  RowActionButton,
  RowActions,
  RowMenuTrigger,
  useRowReveal,
} from "@/components/inbox/row-actions";
import {
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
} from "@/components/ui/menu";
import type { LifecycleApi } from "@/hooks/use-lifecycle";
import type { ThreadFamily } from "@/lib/inbox";
import type { WorkspaceNode } from "@/lib/tree";
import type { RootSelectionIntent } from "@/lib/thread-management";
import { BULK_PROTECTION_LABELS, bulkEligibility } from "@/lib/thread-management";
import type { NestPreferences } from "@/lib/preferences";
import { renameIntent } from "@/lib/groups";

export interface TreeRowHandlers {
  readonly providerInfoById: ReadonlyMap<string, ProviderGlyphInfo>;
  readonly activeThreadId: string | null;
  readonly forceExpanded: boolean;
  readonly lifecycle: LifecycleApi;
  readonly onNavigate: () => void;
  readonly now: number;
  readonly selectionMode: boolean;
  readonly selectedRootIds: ReadonlySet<string>;
  readonly selectionHintId: string;
  readonly onToggleRoot: (threadId: string, intent: RootSelectionIntent) => void;
  /** Opens the new-thread dialog seeded from a workspace row. */
  readonly onNewThreadInWorkspace: (launch: WorkspaceLaunch) => void;
  readonly preferences: NestPreferences;
  /** Family reordering is disabled by selection, filters, and host search. */
  readonly reorderEnabled: boolean;
  readonly reorderDisabledReason: string | null;
  readonly onReorder: (input: FamilyReorderInput) => void;
  readonly onKeyboardMove: (
    projectId: string,
    rootId: string,
    direction: -1 | 1,
  ) => void;
  readonly projectReorderEnabled: boolean;
  readonly projectReorderDisabledReason: string | null;
  readonly onProjectReorder: (input: ProjectReorderInput) => void;
  readonly onProjectKeyboardMove: (
    projectId: string,
    direction: -1 | 1,
  ) => void;
  /** Move a group through the explicit order the store persists. */
  readonly onGroupMove?: (groupId: string, delta: -1 | 1) => void;
  /** Rename a project from a row menu; opens bb's own name field. */
  readonly onRenameProject: (projectId: string, name: string) => void;
  /** Rename a worktree's environment — the alias the row shows beside its branch. */
  readonly onRenameWorktree: (environmentId: string, name: string) => void;
}

export interface FamilyReorderInput {
  readonly sourceProjectId: string;
  readonly sourceRootId: string;
  readonly targetProjectId: string;
  readonly targetRootId: string;
  readonly position: "before" | "after";
}

export interface ProjectReorderInput {
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly position: "before" | "after";
}

/**
 * A workspace row's + carries both the workspace to reuse and the project it
 * belongs to, because the dialog's project picker must be seeded from the row
 * the user actually clicked rather than from whatever project is on screen.
 */
export interface WorkspaceLaunch {
  readonly node: WorkspaceNode;
  readonly projectId: string;
  readonly projectName: string;
}

/**
 * One workspace: a worktree, the project checkout, or the no-workspace bucket.
 *
 * Collapsed by default when a project has several, because the whole point of
 * this level is to make many worktrees navigable rather than to show them all
 * at once.
 */
export function WorkspaceGroup({
  node,
  projectId,
  projectName,
  handlers,
}: {
  node: WorkspaceNode;
  projectId: string;
  projectName: string;
  handlers: TreeRowHandlers;
}) {
  const actions = useSidebarThreadActions();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const reveal = useRowReveal();
  const listId = useId();
  const renameInput = useRef<HTMLInputElement>(null);
  const threadCount = node.families.reduce(
    (total, family) => total + 1 + family.children.length,
    0,
  );

  const label = node.ref.label;
  const branch = node.ref.branch;
  const alias = node.ref.alias;
  // The alias leads the row and the branch follows it, so a mistyped alias is
  // caught by the branch sitting right next to it rather than by opening
  // something. When there is no alias the branch alone is the row.
  const showBranch = alias !== null && branch !== null && alias !== branch;

  const rows: InfoCardRow[] = [
    { label: "Kind", value: node.ref.kind === "worktree" ? "Worktree" : node.ref.kind === "main" ? "Checkout" : "No workspace" },
    { label: "Project", value: projectName },
    { label: "Threads", value: String(threadCount) },
    ...(alias === null ? [] : [{ label: "Alias", value: alias }]),
    ...(branch === null ? [] : [{ label: "Branch", value: branch, mono: true, copy: true }]),
    ...(node.ref.environmentId === null
      ? []
      : [{ label: "Env ID", value: node.ref.environmentId, mono: true, copy: true }]),
  ];

  return (
    <section aria-label={node.ref.label}>
      <InfoCard
        trigger={
      <div
        {...reveal.handlers}
        className="group/ws flex h-7 w-full items-center gap-1.5 rounded-md pl-4 pr-1.5 hover:bg-sidebar-accent/50"
      >
        {renaming && node.ref.environmentId !== null ? (
          <WorkspaceNameField
            inputRef={renameInput}
            initial={alias ?? branch ?? ""}
            fallback={label}
            ariaLabel={`Rename worktree ${label}`}
            onCommit={(draft) => {
              const next = renameIntent(draft, alias ?? "");
              setRenaming(false);
              if (next !== null && node.ref.environmentId !== null) {
                handlers.onRenameWorktree(node.ref.environmentId, next);
              }
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={showBranch ? `${label} → ${branch}` : label}
        >
          <Icon
            name="GitBranch"
            className="size-3 shrink-0 text-muted-foreground/60"
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            {/* The alias reads as a name, so it is not monospaced; the branch
                is an identifier, so it is. */}
            <span className="min-w-0 truncate text-xs text-foreground/80">
              {label}
            </span>
            {showBranch ? (
              <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground/70">
                {branch}
              </span>
            ) : null}
          </span>
        </button>
        )}
        <RowActions>
          <RollupJump
            rollup={node.rollup}
            onJump={(threadId) => {
              actions.open(threadId);
              handlers.onNavigate();
            }}
            onFallback={() => setExpanded((open) => !open)}
          />
          {/* Starting a thread in *this* worktree is the reason to be here, so
              it keeps its own button beside the menu. */}
          <RowActionButton
            label={`New thread in ${label}`}
            icon="Add"
            onClick={() =>
              handlers.onNewThreadInWorkspace({ node, projectId, projectName })
            }
          />
          <Menu
            label={`Actions for ${label}`}
            trigger={
              <RowMenuTrigger
                label={`Actions for ${label}`}
                chevron
                expanded={expanded}
                revealed={reveal.revealed}
              />
            }
          >
            <MenuItem
              icon="Add"
              label="New thread here"
              onSelect={() =>
                handlers.onNewThreadInWorkspace({ node, projectId, projectName })
              }
            />
            <MenuItem
              icon="ChevronDown"
              label={expanded ? "Collapse" : "Expand"}
              onSelect={() => setExpanded((open) => !open)}
            />
            {node.ref.environmentId === null ? (
              <MenuItem
                icon="Edit"
                label="Rename worktree…"
                disabled
                onSelect={() => undefined}
              />
            ) : (
              <MenuItem
                icon="Edit"
                label="Rename worktree…"
                onSelect={() => setRenaming(true)}
              />
            )}
          </Menu>
        </RowActions>
      </div>
        }
        label={label}
        rows={rows}
      />
      {expanded ? (
        <ul id={listId} className="ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
          {node.families.map((family) => (
            <FamilyRow
              key={family.root.id}
              family={family}
              projectId={projectId}
              handlers={handlers}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function FamilyRow({
  family,
  projectId,
  handlers,
}: {
  family: ThreadFamily;
  projectId: string;
  handlers: TreeRowHandlers;
}) {
  const eligibility = bulkEligibility(family, handlers.activeThreadId);
  return (
    <ThreadCard
      thread={family.root}
      childThreads={family.children}
      providerInfoById={handlers.providerInfoById}
      activeThreadId={handlers.activeThreadId}
      canPark={handlers.lifecycle.canPark(family.root)}
      forceExpanded={handlers.forceExpanded}
      onNavigate={handlers.onNavigate}
      onSettle={() => handlers.lifecycle.settle(family.root.id)}
      onSnooze={(until) => handlers.lifecycle.snooze(family.root.id, until)}
      now={handlers.now}
      selectionMode={handlers.selectionMode}
      selected={handlers.selectedRootIds.has(family.root.id)}
      selectionHintId={handlers.selectionHintId}
      selectionDisabledReason={
        eligibility.eligible
          ? null
          : BULK_PROTECTION_LABELS[eligibility.reason]
      }
      onToggleSelected={(intent) => handlers.onToggleRoot(family.root.id, intent)}
      reorderEnabled={handlers.reorderEnabled}
      reorderDisabledReason={handlers.reorderDisabledReason}
      onMoveByKeyboard={(direction) =>
        handlers.onKeyboardMove(projectId, family.root.id, direction)
      }
      onReorderDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-nest-family",
          JSON.stringify({ projectId, rootId: family.root.id }),
        );
      }}
      onReorderDragOver={(event) => {
        if (!handlers.reorderEnabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onReorderDrop={(event) => {
        event.preventDefault();
        const dragged = parseDraggedFamily(
          event.dataTransfer.getData("application/x-nest-family"),
        );
        if (dragged === null) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        handlers.onReorder({
          sourceProjectId: dragged.projectId,
          sourceRootId: dragged.rootId,
          targetProjectId: projectId,
          targetRootId: family.root.id,
          position:
            event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        });
      }}
      preferences={handlers.preferences}
    />
  );
}

/** Flat rendering used when a project occupies a single workspace. */
export function FlatFamilies({
  families,
  projectId,
  handlers,
}: {
  families: readonly ThreadFamily[];
  projectId: string;
  handlers: TreeRowHandlers;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {families.map((family) => (
        <FamilyRow
          key={family.root.id}
          family={family}
          projectId={projectId}
          handlers={handlers}
        />
      ))}
    </ul>
  );
}

/**
 * The worktree alias editor.
 *
 * Commits on a mounted-field basis only: a plain function component whose
 * input is autofocused and whose Enter/blur/Escape rules mirror the group
 * name field, so the two levels rename the same way.
 */
function WorkspaceNameField({
  inputRef,
  initial,
  fallback,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  initial: string;
  /** Shown as help text; the alias the user types replaces what is shown. */
  fallback: string;
  ariaLabel: string;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (commit: boolean) => {
    if (done) return;
    setDone(true);
    if (commit) onCommit(value);
    else onCancel();
  };
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon
        name="Edit"
        className="size-3 shrink-0 text-muted-foreground/60"
        aria-hidden
      />
      <input
        ref={inputRef}
        autoFocus
        value={value}
        maxLength={120}
        aria-label={ariaLabel}
        placeholder={fallback}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
        className={cn(
          "h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      />
    </span>
  );
}

/** Parses the drag payload a family row puts on the data transfer. */
export function parseDraggedFamily(
  raw: string,
): { projectId: string; rootId: string } | null {
  if (raw.length === 0 || raw.length > 1_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("projectId" in parsed) ||
      !("rootId" in parsed) ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.rootId !== "string"
    ) {
      return null;
    }
    return { projectId: parsed.projectId, rootId: parsed.rootId };
  } catch {
    return null;
  }
}

export type { PluginSidebarThread, DragEvent };
