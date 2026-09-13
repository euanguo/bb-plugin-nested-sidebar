import {
  useId,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RowContextMenu } from "@/components/inbox/row-context-menu";
import {
  Menu,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import {
  ROW_MENU_OVERLAY_CLASS,
  RowMenuTrigger,
  useRowReveal,
} from "@/components/inbox/row-actions";
import {
  ProviderGlyph,
  type ProviderGlyphInfo,
} from "@/components/inbox/provider-glyph";
import { StatusGlyph } from "@/components/inbox/status-glyph";
import { threadStatus } from "@/components/inbox/status-slot";
import { PullRequestMetadata } from "@/components/inbox/row-metadata";
import {
  FamilyStatusIcon,
} from "@/components/inbox/family-status";
import { familyWaitingForAgents } from "@/lib/attention-state";
import { familyStatus } from "@/lib/family-status";
import { threadDisplayTitle, threadIsWorking } from "@/lib/inbox";
import { resolveFamilyExpanded } from "@/lib/thread-management";
import type { RootSelectionIntent } from "@/lib/thread-management";
import type { NestPreferences } from "@/lib/preferences";
import { relativeTimeLabel } from "@/lib/relative-time";
import { resolveSnoozePresets } from "@/lib/lifecycle";

export function ThreadCard({
  thread,
  childThreads,
  providerInfoById,
  activeThreadId,
  canPark,
  forceExpanded,
  onNavigate,
  onSettle,
  onSnooze,
  now,
  selectionMode,
  selected,
  selectionDisabledReason,
  selectionHintId,
  onToggleSelected,
  reorderEnabled,
  reorderDisabledReason,
  onMoveByKeyboard,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDrop,
  preferences,
}: {
  thread: PluginSidebarThread;
  childThreads: readonly PluginSidebarThread[];
  providerInfoById: ReadonlyMap<string, ProviderGlyphInfo>;
  activeThreadId: string | null;
  /** False while the root is working or blocked on the user. */
  canPark: boolean;
  /** Search results reveal their matching descendants. */
  forceExpanded: boolean;
  onNavigate: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  /** Quantized clock, shared by every row in one render. */
  now: number;
  selectionMode: boolean;
  selected: boolean;
  selectionDisabledReason: string | null;
  selectionHintId: string;
  onToggleSelected: (intent: RootSelectionIntent) => void;
  reorderEnabled: boolean;
  reorderDisabledReason: string | null;
  onMoveByKeyboard: (direction: -1 | 1) => void;
  onReorderDragStart: (event: DragEvent<HTMLSpanElement>) => void;
  onReorderDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onReorderDrop: (event: DragEvent<HTMLLIElement>) => void;
  preferences: NestPreferences;
}) {
  const actions = useSidebarThreadActions();
  const reveal = useRowReveal();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const { pullRequest } = useSidebarThreadPullRequest(thread.id);
  const childListId = useId();
  /**
   * When details live on hover, the row is a single column: title plus status,
   * nothing else. Everything suppressed here is still reachable from the hover
   * card, including the child count's own disclosure, which keeps its button in
   * the card rather than on the row.
   */
  const detailsOnHover = preferences.rowDetails === "hover";
  const showRowDetails = !detailsOnHover;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );

  const familyIsActive =
    thread.id === activeThreadId ||
    childThreads.some((child) => child.id === activeThreadId);
  const childNeedsAttention = childThreads.some(
    (child) =>
      child.hasPendingInteraction ||
      child.isUnread ||
      threadIsWorking(child),
  );
  const expanded = resolveFamilyExpanded({
    childCount: childThreads.length,
    forceExpanded,
    override: expandedOverride,
    defaultExpanded: preferences.defaultChildrenExpanded,
  });
  const waitingForAgents = familyWaitingForAgents(childThreads);
  const childProviderIds = useMemo(
    () => [...new Set(childThreads.map((child) => child.providerId))].slice(0, 2),
    [childThreads],
  );
  const childProviderNames = childProviderIds
    .map(
      (providerId) =>
        providerInfoById.get(providerId)?.displayName ?? providerId,
    )
    .join(", ");
  const childDisclosureLabel = `${expanded ? "Hide" : "Show"} ${childThreads.length} child${childThreads.length === 1 ? " thread" : " threads"}${childProviderNames ? `; providers: ${childProviderNames}` : ""}`;
  const rootIsActive = thread.id === activeThreadId;
  const familyState = familyStatus([thread, ...childThreads], now);

  return (
    <RowContextMenu thread={thread}>
      <li
        className="list-none"
        data-nest-family={thread.id}
        onDragOver={onReorderDragOver}
        onDrop={onReorderDrop}
      >
        <div
          className={cn(
            "rounded-xl border transition-colors",
            expanded
              ? "border-sidebar-border bg-sidebar-accent/35 py-1"
              : "border-transparent",
            familyIsActive && "bg-sidebar-accent/60",
            !familyIsActive && layout !== null && "bg-sidebar-accent/25",
          )}
        >
          {/* The card hangs off the row itself, not the whole family: a card on
              the outer element would also open while the pointer was on a child
              thread below it. */}
          <div
            data-nest-root-card=""
            {...reveal.handlers}
            className={cn(
              "group/root relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg px-1.5",
              preferences.rowLayout === "one-line" || detailsOnHover
                ? "grid-rows-[1.25rem]"
                : "grid-rows-[1rem_1rem] gap-y-0.5",
              preferences.density === "compact"
                ? "py-0.5"
                : "py-1",
              rootIsActive
                ? "bg-sidebar-accent"
                : "hover:bg-sidebar-accent/60",
            )}
          >
            {selectionMode ? (
              <button
                type="button"
                data-nest-selection-target={thread.id}
                aria-label={
                  selectionDisabledReason === null
                    ? `${selected ? "Deselect" : "Select"} ${threadDisplayTitle(thread)}`
                    : `${threadDisplayTitle(thread)} cannot be selected: ${selectionDisabledReason}`
                }
                aria-pressed={
                  selectionDisabledReason === null ? selected : undefined
                }
                aria-describedby={
                  selectionDisabledReason === null ? selectionHintId : undefined
                }
                title={
                  selectionDisabledReason ?? "Shift+click to select a range"
                }
                disabled={selectionDisabledReason !== null}
                onClick={(event) => {
                  onToggleSelected({
                    selected: !selected,
                    shiftKey: event.shiftKey,
                  });
                }}
                className={cn(
                  "absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selectionDisabledReason === null
                    ? "cursor-pointer"
                    : "cursor-not-allowed",
                )}
              />
            ) : (
              <>
                {/* The shortcut/split contract requires an anchor, while the
                    controls remain sibling buttons above it. */}
                {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- bb's
                    shortcut and split-drag contracts require an anchor. */}
                <a
                  data-sidebar-thread-shortcut-target=""
                  data-sidebar-thread-id={thread.id}
                  href="#"
                  aria-label={threadDisplayTitle(thread)}
                  aria-current={rootIsActive ? "page" : undefined}
                  {...splitProps}
                  onClick={(event) => {
                    event.preventDefault();
                    actions.open(thread.id, {
                      split: event.metaKey || event.ctrlKey,
                    });
                    onNavigate();
                  }}
                  className="absolute inset-0 cursor-pointer rounded-lg"
                />
              </>
            )}

            {selectionMode ? (
              <input
                type="checkbox"
                checked={selected}
                data-nest-select-root={thread.id}
                aria-label={
                  selectionDisabledReason === null
                    ? `${selected ? "Deselect" : "Select"} ${threadDisplayTitle(thread)}`
                    : `${threadDisplayTitle(thread)} cannot be selected: ${selectionDisabledReason}`
                }
                aria-describedby={
                  selectionDisabledReason === null ? selectionHintId : undefined
                }
                title={
                  selectionDisabledReason ?? "Shift+click to select a range"
                }
                disabled={selectionDisabledReason !== null}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  onToggleSelected({
                    selected: event.currentTarget.checked,
                    shiftKey:
                      "shiftKey" in event.nativeEvent &&
                      event.nativeEvent.shiftKey === true,
                  });
                }}
                className={cn(
                  "relative z-10 col-start-1 row-start-1 size-4 shrink-0 cursor-pointer rounded border accent-primary transition-colors",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selectionDisabledReason !== null &&
                    "cursor-not-allowed opacity-35",
                )}
              />
            ) : null}

            {selectionMode ? null : (
              <FamilyStatusIcon
                status={familyState}
                variant={preferences.statusDisplay}
                className="col-start-1 row-start-1"
                draggable={reorderEnabled}
                reorderHelp={
                  reorderEnabled
                    ? "Drag this status marker to reorder. Press Alt+Up or Alt+Down to move the family."
                    : (reorderDisabledReason ?? "Reordering is unavailable.")
                }
                onDragStart={(event) => {
                  event.stopPropagation();
                  if (!reorderEnabled) {
                    event.preventDefault();
                    return;
                  }
                  onReorderDragStart(event);
                }}
                onKeyDown={(event) => {
                  if (!event.altKey) return;
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveByKeyboard(event.key === "ArrowUp" ? -1 : 1);
                  }
                }}
              />
            )}

            <div
              className={cn(
                "pointer-events-none relative col-start-2 min-w-0",
                preferences.rowLayout === "one-line" || detailsOnHover
                  ? "row-start-1 flex min-w-0 items-center gap-1.5"
                  : "row-span-2",
              )}
            >
              <div
                data-nest-root-title-row=""
                className={cn(
                  "flex h-4 min-w-0 items-center gap-1.5",
                  (preferences.rowLayout === "one-line" || detailsOnHover) &&
                    "flex-1",
                )}
              >
                <span
                  title={threadDisplayTitle(thread)}
                  className={cn(
                    // One type size for a title in both layouts: the row is
                    // denser than bb's own list, and a title that changes size
                    // when the layout changes reads as a different list.
                    "min-w-0 flex-1 truncate text-xs",
                    thread.isUnread ? "font-semibold" : "font-medium",
                    !familyState.receded
                      ? "text-foreground"
                      : "text-muted-foreground/65",
                  )}
                >
                  {threadDisplayTitle(thread)}
                </span>
                {thread.isPinned ? (
                  <Icon
                    name="Pin"
                    aria-label="Pinned thread"
                    className="relative z-10 size-3 shrink-0 text-muted-foreground/70"
                  />
                ) : null}
                {/* One-line layout: the branch rides beside the title, so the
                    row costs a single line of height. */}
                {preferences.rowLayout === "one-line" &&
                showRowDetails &&
                preferences.showThreadLocation ? (
                  <ThreadLocation thread={thread} />
                ) : null}
              </div>
              {preferences.rowLayout === "two-line" && showRowDetails ? (
                <div
                  data-nest-root-detail-row=""
                  className={cn(
                    "mt-0.5 flex h-4 min-w-0 items-center gap-1.5 text-2xs",
                    familyState.receded
                      ? "text-muted-foreground/55"
                      : "text-muted-foreground",
                  )}
                >
                  {preferences.showThreadLocation ? (
                    <ThreadLocation thread={thread} />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "relative z-10 col-start-3 flex shrink-0 items-end",
                preferences.rowLayout === "one-line" || detailsOnHover
                  ? "row-start-1 flex-row gap-1.5"
                  : "row-span-2 flex-col gap-0.5",
                selectionMode && "pointer-events-none",
              )}
            >
              <span
                data-nest-root-time=""
                className={cn(
                  "flex h-4 items-center justify-end",
                  canPark && !selectionMode && "group-hover/root:hidden",
                )}
              >
                {preferences.showRelativeTime && showRowDetails ? (
                  <ThreadStatusLabel thread={thread} now={now} />
                ) : null}
              </span>
              {canPark && !selectionMode && showRowDetails ? (
                <span className="hidden h-4 items-center gap-0.5 group-hover/root:flex">
                  <ParkButton
                    label="Snooze until tomorrow"
                    icon="Clock"
                    onActivate={() => {
                      const tomorrow = resolveSnoozePresets(new Date()).find(
                        (preset) => preset.id === "tomorrow",
                      );
                      if (tomorrow) onSnooze(tomorrow.snoozedUntil);
                    }}
                  />
                  <ParkButton
                    label="Settle thread"
                    icon="Archive"
                    onActivate={onSettle}
                  />
                </span>
              ) : null}
              <div
                data-nest-root-metadata=""
                className="relative flex h-4 max-w-full items-center justify-end gap-1 whitespace-nowrap"
              >
                {showRowDetails &&
                preferences.showPullRequestMetadata &&
                pullRequest ? (
                  <PullRequestMetadata
                    pullRequest={pullRequest}
                    interactive={!selectionMode}
                  />
                ) : null}
                {showRowDetails &&
                childThreads.length > 0 &&
                preferences.showChildCount ? (
                  <button
                    type="button"
                    aria-label={
                      selectionMode
                        ? `${childThreads.length} child threads; exit selection mode to ${expanded ? "hide" : "show"}${childProviderNames ? `; providers: ${childProviderNames}` : ""}`
                        : childDisclosureLabel
                    }
                    aria-expanded={expanded}
                    aria-controls={childListId}
                    disabled={selectionMode}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setExpandedOverride(!expanded);
                    }}
                    className={cn(
                      "group/children relative flex h-4 items-center gap-0.5 rounded px-0.5 text-2xs font-medium text-muted-foreground",
                      "hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      selectionMode && "pointer-events-none",
                      childNeedsAttention && "text-primary",
                    )}
                  >
                    <Icon
                      name="ChevronDown"
                      className={cn(
                        "size-3 transition-transform",
                        expanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                    <span className="tabular-nums">{childThreads.length}</span>
                    {preferences.showProviderIcons ? (
                      <span className="flex items-center -space-x-0.5">
                        {childProviderIds.map((providerId) => (
                          <ProviderGlyph
                            key={providerId}
                            providerId={providerId}
                            provider={providerInfoById.get(providerId)}
                            className="size-3 opacity-80"
                            interactive={false}
                          />
                        ))}
                      </span>
                    ) : null}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full right-0 z-30 mb-1 w-max max-w-56 translate-y-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs leading-tight text-popover-foreground opacity-0 shadow-md transition-all group-hover/children:translate-y-0 group-hover/children:opacity-100 group-focus-visible/children:translate-y-0 group-focus-visible/children:opacity-100"
                    >
                      {childDisclosureLabel}
                    </span>
                  </button>
                ) : showRowDetails && preferences.showProviderIcons ? (
                  <ProviderGlyph
                    providerId={thread.providerId}
                    provider={providerInfoById.get(thread.providerId)}
                    className="size-3 opacity-75"
                  />
                ) : null}
              </div>
            </div>

            {selectionMode ? null : (
              <ThreadMenu
                thread={thread}
                expanded={expanded}
                childCount={childThreads.length}
                canToggleChildren={childThreads.length > 0}
                revealed={reveal.revealed}
                onToggleChildren={() => setExpandedOverride(!expanded)}
                onSettle={onSettle}
                onSnooze={onSnooze}
                canPark={canPark}
                className={ROW_MENU_OVERLAY_CLASS}
              />
            )}
          </div>

          {expanded ? (
            <ul
              id={childListId}
              aria-label={`Agents for ${threadDisplayTitle(thread)}`}
              className={cn(
                "ml-[14px] border-l pb-0.5 pl-3 transition-colors",
                waitingForAgents
                  ? "border-current"
                  : "border-sidebar-border",
              )}
              style={
                waitingForAgents
                  ? { borderColor: "var(--nest-status-working)" }
                  : undefined
              }
            >
              {childThreads.map((child) => (
                <ChildThreadRow
                  key={child.id}
                  thread={child}
                  provider={providerInfoById.get(child.providerId)}
                  isActive={child.id === activeThreadId}
                  onNavigate={onNavigate}
                  now={now}
                  preferences={preferences}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </li>
    </RowContextMenu>
  );
}

/**
 * The thread's own menu.
 *
 * The right-click menu still exists and still holds the full set; this is the
 * discoverable twin of it, because a context menu is not an entrance.
 * Aggregate rows keep their disclosure chevron in normal flow; thread rows
 * have no stable trailing control, so their menu trigger is an overlay.
 */
function ThreadMenu({
  thread,
  expanded,
  childCount,
  canToggleChildren,
  revealed,
  onToggleChildren,
  onSettle,
  onSnooze,
  canPark,
  className,
}: {
  thread: PluginSidebarThread;
  expanded: boolean;
  childCount: number;
  canToggleChildren: boolean;
  revealed: boolean;
  onToggleChildren: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  canPark: boolean;
  className?: string;
}) {
  const actions = useSidebarThreadActions();
  const tomorrow = () => {
    const preset = resolveSnoozePresets(new Date()).find(
      (candidate) => candidate.id === "tomorrow",
    );
    if (preset !== undefined) onSnooze(preset.snoozedUntil);
  };
  return (
    <Menu
      label={`Actions for ${threadDisplayTitle(thread)}`}
      trigger={
        <RowMenuTrigger
          label={`Actions for ${threadDisplayTitle(thread)}`}
          revealed={revealed}
          className={className}
        />
      }
    >
      {canToggleChildren ? (
        <MenuItem
          icon="ChevronDown"
          label={`${expanded ? "Hide" : "Show"} ${childCount} child${childCount === 1 ? "" : "ren"}`}
          onSelect={onToggleChildren}
        />
      ) : null}
      <MenuItem
        icon="ArrowRight"
        label="Open in split"
        onSelect={() => actions.open(thread.id, { split: true })}
      />
      <MenuSeparator />
      <MenuItem
        icon={thread.isUnread ? "Eye" : "CircleQuestion"}
        label={thread.isUnread ? "Mark read" : "Mark unread"}
        onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
      />
      <MenuItem
        icon="Pin"
        label={thread.isPinned ? "Unpin" : "Pin"}
        onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
      />
      {canPark ? (
        <>
          <MenuSeparator />
          <MenuItem icon="Clock" label="Snooze until tomorrow" onSelect={tomorrow} />
          <MenuItem icon="Archive" label="Settle thread" onSelect={onSettle} />
        </>
      ) : null}
      <MenuSeparator />
      <MenuItem
        icon="Archive"
        label="Archive"
        onSelect={() => actions.archive(thread.id)}
      />
      <MenuItem
        icon="Trash"
        label="Delete…"
        destructive
        onSelect={() => actions.requestDelete(thread.id)}
      />
    </Menu>
  );
}

function ChildThreadRow({
  thread,
  provider,
  isActive,
  onNavigate,
  now,
  preferences,
}: {
  thread: PluginSidebarThread;
  provider?: ProviderGlyphInfo;
  isActive: boolean;
  onNavigate: () => void;
  now: number;
  preferences: NestPreferences;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const reveal = useRowReveal();
  const status = threadStatus(thread);
  const isWorking = threadIsWorking(thread);
  const showRowDetails = preferences.rowDetails !== "hover";

  return (
    <RowContextMenu thread={thread}>
      <li className="relative list-none py-px">
        <span
          aria-hidden
          className={cn(
            "absolute -left-3 top-1/2 h-px w-3 transition-colors",
            !isWorking && "bg-sidebar-border",
          )}
          style={
            isWorking
              ? { backgroundColor: "var(--nest-status-working)" }
              : undefined
          }
        />
        <div
          {...reveal.handlers}
          className={cn(
            "group/child relative flex items-start gap-1.5 rounded-md px-1.5",
            preferences.density === "compact" ? "py-0.5" : "py-1",
            isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            !isActive && layout !== null && "bg-sidebar-accent/25",
          )}
        >
          {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- bb's
              shortcut and split-drag contracts require an anchor. */}
          <a
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            href="#"
            aria-label={threadDisplayTitle(thread)}
            aria-current={isActive ? "page" : undefined}
            {...splitProps}
            onClick={(event) => {
              event.preventDefault();
              actions.open(thread.id, {
                split: event.metaKey || event.ctrlKey,
              });
              onNavigate();
            }}
            className="absolute inset-0 cursor-pointer rounded-md"
          />
          {showRowDetails && preferences.showProviderIcons ? (
            <ProviderGlyph
              providerId={thread.providerId}
              provider={provider}
              className="relative mt-0.5"
            />
          ) : null}
          <ThreadStateGlyph thread={thread} className="relative mt-0.5" />
          <div className="pointer-events-none relative min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                title={threadDisplayTitle(thread)}
                className={cn(
                  "min-w-0 flex-1 truncate text-xs",
                  thread.isUnread
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {threadDisplayTitle(thread)}
              </span>
              {showRowDetails && preferences.showRelativeTime ? (
                <span className="shrink-0 tabular-nums text-2xs text-muted-foreground/70">
                  {relativeTimeLabel(thread.updatedAt, now)}
                </span>
              ) : null}
            </div>
            {showRowDetails &&
            (preferences.rowLayout === "two-line" ||
              preferences.showThreadLocation) ? (
              <div className="mt-0.5 flex h-3.5 min-w-0 items-center gap-1.5 text-2xs">
                {preferences.showThreadLocation ? (
                  <ThreadLocation thread={thread} />
                ) : null}
              </div>
            ) : null}
          </div>
          <ThreadMenu
            thread={thread}
            expanded={false}
            childCount={0}
            canToggleChildren={false}
            revealed={reveal.revealed}
            onToggleChildren={() => undefined}
            onSettle={() => undefined}
            onSnooze={() => undefined}
            canPark={false}
            className={ROW_MENU_OVERLAY_CLASS}
          />
        </div>
      </li>
    </RowContextMenu>
  );
}

function ThreadStateGlyph({
  thread,
  className,
}: {
  thread: PluginSidebarThread;
  className?: string;
}) {
  const status = threadStatus(thread);
  const label =
    status === null
      ? "Inactive: no active work in this child thread"
      : `${thread.indicatorLabel ?? status.label}: child thread status`;

  const glyph =
    status === null ? (
      <span
        aria-hidden
        className="size-2 rounded-full opacity-50"
        style={{
          backgroundColor:
            "var(--nest-status-inactive, var(--muted-foreground))",
        }}
      />
    ) : (
      <StatusGlyph indicator={status.indicator} label={null} />
    );

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      tabIndex={0}
      className={cn(
        "group/child-status flex size-3.5 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {glyph}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 w-max max-w-56 translate-y-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs leading-tight text-popover-foreground opacity-0 shadow-md transition-all group-hover/child-status:translate-y-0 group-hover/child-status:opacity-100 group-focus-visible/child-status:translate-y-0 group-focus-visible/child-status:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

function ThreadStatusLabel({
  thread,
  now,
}: {
  thread: PluginSidebarThread;
  now: number;
}) {
  return (
    <span className="tabular-nums text-2xs text-muted-foreground/70">
      {relativeTimeLabel(thread.updatedAt, now)}
    </span>
  );
}

function ThreadLocation({ thread }: { thread: PluginSidebarThread }) {
  const branch = thread.environment?.branchName;
  if (branch) {
    return (
      <span
        title={`Branch: ${branch}`}
        // Carries its own size rather than inheriting: in the one-line layout
        // this sits in the title row, which has no type size of its own, and an
        // inherited 14px branch read as the largest thing on the row.
        className="flex min-w-0 flex-1 items-center gap-1 truncate text-2xs text-muted-foreground"
      >
        <Icon
          name="GitBranch"
          aria-label="Branch"
          className="size-3 shrink-0 text-muted-foreground/60"
        />
        <span className="truncate font-mono">{branch}</span>
      </span>
    );
  }
  if (thread.host) {
    return (
      <span
        title={`Host: ${thread.host.name}`}
        className="min-w-0 flex-1 truncate text-2xs text-muted-foreground"
      >
        {thread.host.name}
      </span>
    );
  }
  return <span className="flex-1" />;
}

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: Extract<IconName, "Archive" | "Clock">;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}
