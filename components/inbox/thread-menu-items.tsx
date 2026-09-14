import { useState, type ReactNode } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { IconName } from "@/components/ui/icon";
import { copyWithAnnouncement } from "@/lib/clipboard";
import { threadLinkUrl } from "@/lib/thread-link";
import { threadDisplayTitle } from "@/lib/inbox";
import { ThreadRenameDialog } from "@/components/inbox/thread-rename-dialog";
import { resolveSnoozePresets } from "@/lib/lifecycle";

/**
 * One thread action, described once and drawn by both surfaces.
 *
 * The row has two ways in — the dropdown behind its menu trigger and the
 * right-click menu — and bb's own sidebar keeps them identical. Describing the
 * items here rather than in each surface is what keeps them identical for us:
 * a new action is added once and appears in both, instead of being added to
 * the dropdown and silently missing from the context menu.
 *
 * The set matches bb's own thread menu. Copying is deliberately two items:
 * the link is what a person pastes into a chat, and the id is what a person
 * pastes into a command or a bug report. bb offers the link alone, so the id is
 * additive here.
 */
export interface ThreadMenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly destructive?: boolean;
  /** Draw a divider above this item, so the menu reads in the same groups. */
  readonly separatorBefore?: boolean;
  readonly onSelect: () => void;
}

export interface ThreadMenuActions {
  readonly items: readonly ThreadMenuItem[];
  /** Mounted by the caller so both surfaces share one dialog instance. */
  readonly dialog: ReactNode;
}

export function useThreadMenuActions({
  thread,
  expanded,
  childCount,
  canToggleChildren,
  onToggleChildren,
  onSettle,
  onSnooze,
  canPark,
  onUnarchive,
  splitAvailable,
}: {
  thread: PluginSidebarThread;
  expanded: boolean;
  childCount: number;
  canToggleChildren: boolean;
  onToggleChildren: () => void;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  canPark: boolean;
  /**
   * Restore an archived thread. The SDK exposes `archive` but no inverse, so
   * the plugin's own lifecycle owns the restore and hands it in. Absent for a
   * thread that is not archived.
   */
  onUnarchive?: () => void;
  /**
   * Whether this thread can open in a split pane. Passed in rather than read
   * here because the caller already subscribes for its own drag support, and a
   * second subscription per row is a cost with no benefit.
   */
  splitAvailable: boolean;
}): ThreadMenuActions {
  const actions = useSidebarThreadActions();
  const [renaming, setRenaming] = useState(false);
  const tomorrow = () => {
    const preset = resolveTomorrow();
    if (preset !== null) onSnooze(preset);
  };

  const items: ThreadMenuItem[] = [];
  if (canToggleChildren) {
    items.push({
      key: "children",
      icon: "ChevronDown",
      label: `${expanded ? "Hide" : "Show"} ${childCount} child${childCount === 1 ? "" : "ren"}`,
      onSelect: onToggleChildren,
    });
  }
  if (splitAvailable) {
    items.push({
      key: "split",
      icon: "ArrowRight",
      label: "Open in split",
      onSelect: () => actions.open(thread.id, { split: true }),
    });
  }
  items.push(
    {
      key: "copy-link",
      icon: "CopyLink",
      label: "Copy thread link",
      separatorBefore: items.length > 0,
      onSelect: () => {
        void copyWithAnnouncement(
          threadLinkUrl(thread.projectId, thread.id),
          "Thread link",
        );
      },
    },
    {
      key: "copy-id",
      icon: "IdCard",
      label: "Copy thread ID",
      onSelect: () => {
        void copyWithAnnouncement(thread.id, "Thread ID");
      },
    },
    {
      key: "read",
      icon: thread.isUnread ? "Eye" : "CircleQuestion",
      label: thread.isUnread ? "Mark read" : "Mark unread",
      separatorBefore: true,
      onSelect: () => void actions.setRead(thread.id, thread.isUnread),
    },
    {
      key: "pin",
      icon: thread.isPinned ? "PinOff" : "Pin",
      label: thread.isPinned ? "Unpin" : "Pin",
      onSelect: () => void actions.setPinned(thread.id, !thread.isPinned),
    },
    {
      key: "rename",
      icon: "Edit",
      label: "Rename…",
      separatorBefore: true,
      onSelect: () => setRenaming(true),
    },
  );

  if (canPark) {
    items.push(
      {
        key: "snooze",
        icon: "Clock",
        label: "Snooze until tomorrow",
        onSelect: tomorrow,
      },
      {
        key: "settle",
        icon: "Archive",
        label: "Settle thread",
        onSelect: onSettle,
      },
    );
  }

  items.push(
    thread.isArchived && onUnarchive !== undefined
      ? {
          key: "unarchive",
          icon: "ArchiveRestore",
          label: "Unarchive",
          separatorBefore: true,
          onSelect: onUnarchive,
        }
      : {
          key: "archive",
          icon: "Archive",
          label: "Archive",
          separatorBefore: true,
          onSelect: () => actions.archive(thread.id),
        },
    {
      key: "delete",
      icon: "Trash",
      label: "Delete…",
      destructive: true,
      onSelect: () => actions.requestDelete(thread.id),
    },
  );

  return {
    items,
    dialog: renaming ? (
      <ThreadRenameDialog
        threadId={thread.id}
        currentTitle={threadDisplayTitle(thread)}
        onClose={() => setRenaming(false)}
      />
    ) : null,
  };
}

/**
 * The tomorrow preset, or null when the clock cannot produce one. Kept out of
 * the hook body so the two callers that need it (menu and keyboard) agree.
 */
function resolveTomorrow(): number | null {
  const preset = resolveSnoozePresets(new Date()).find(
    (candidate) => candidate.id === "tomorrow",
  );
  return preset === undefined ? null : preset.snoozedUntil;
}
