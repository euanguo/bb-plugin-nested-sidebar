import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PlainDialog } from "@/components/ui/modal";
import { GROUP_ICON_OPTIONS, validGroupIcon, type ProjectGroup } from "@/lib/groups";

/**
 * Create, rename, reorder, and delete groups.
 *
 * Deleting a group is described as what it actually is — releasing its
 * projects back to Ungrouped — because "delete" alone reads like it might take
 * the projects with it, and it never does.
 */
export function GroupManagerDialog({
  open,
  groups,
  onClose,
}: {
  open: boolean;
  groups: readonly ProjectGroup[];
  onClose: () => void;
}) {
  const rpc = useRpc<typeof nestRpcContract>();
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState<ProjectGroup["icon"]>("Layer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const name = draftName.trim();
      if (name.length === 0) return;
      await rpc.call("createGroup", { name, icon: draftIcon });
      setDraftName("");
      setDraftIcon("Layer");
    });

  const move = (groupId: string, delta: -1 | 1) => {
    const ids = groups.map((group) => group.id);
    const index = ids.indexOf(groupId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    next.splice(index, 1);
    next.splice(target, 0, groupId);
    void run(() => rpc.call("reorderGroups", { groupIds: next }));
  };

  return (
    <PlainDialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      className="w-[min(28rem,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">
            Project groups
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          >
            <Icon name="CircleX" className="size-3.5" aria-hidden />
          </button>
        </div>

        <p className="text-2xs leading-relaxed text-muted-foreground">
          A group is a bucket above projects. Deleting one releases its
          projects back to Ungrouped; no project or thread is ever removed.
        </p>

        {error === null ? null : (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
            {error}
          </p>
        )}

        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {groups.length === 0 ? (
            <li className="px-1 py-2 text-2xs text-muted-foreground">
              No groups yet.
            </li>
          ) : (
            groups.map((group, index, all) => (
              <li
                key={group.id}
                className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent/60"
              >
                <Icon
                  name={group.icon}
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <select
                  value={group.icon}
                  aria-label={`Icon for ${group.name}`}
                  disabled={busy}
                  onChange={(event) => {
                    const icon = event.currentTarget.value;
                    if (validGroupIcon(icon)) {
                      void run(() => rpc.call("renameGroup", { groupId: group.id, name: group.name, icon }));
                    }
                  }}
                  className="h-6 w-20 rounded border border-border bg-background px-1 text-2xs"
                >
                  {GROUP_ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
                <GroupNameEditor
                  group={group}
                  disabled={busy}
                  onRename={(name) =>
                    run(() => rpc.call("renameGroup", { groupId: group.id, name }))
                  }
                />
                <button
                  type="button"
                  aria-label={`Move ${group.name} up`}
                  disabled={busy || index === 0}
                  onClick={() => move(group.id, -1)}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                >
                  <Icon name="ChevronUp" className="size-3" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${group.name} down`}
                  disabled={busy || index === all.length - 1}
                  onClick={() => move(group.id, 1)}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                >
                  <Icon name="ChevronDown" className="size-3" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Delete group ${group.name}`}
                  title="Delete group (releases its projects)"
                  disabled={busy}
                  onClick={() =>
                    run(() => rpc.call("deleteGroup", { groupId: group.id }))
                  }
                  className="flex size-5 items-center justify-center rounded text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30"
                >
                  <Icon name="Trash" className="size-3" aria-hidden />
                </button>
              </li>
            ))
          )}
        </ul>

        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="New group name"
            aria-label="New group name"
            maxLength={60}
            className={cn(
              "h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            )}
          />
          <select
            value={draftIcon}
            aria-label="New group icon"
            onChange={(event) => {
              const icon = event.currentTarget.value;
              if (validGroupIcon(icon)) setDraftIcon(icon);
            }}
            className="h-7 w-20 rounded-md border border-border bg-background px-1 text-2xs"
          >
            {GROUP_ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
          </select>
          <button
            type="submit"
            disabled={busy || draftName.trim().length === 0}
            className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>
    </PlainDialog>
  );
}

function GroupNameEditor({
  group,
  disabled,
  onRename,
}: {
  group: ProjectGroup;
  disabled: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(group.name);
  useEffect(() => setValue(group.name), [group.name]);
  return (
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const name = value.trim();
        if (name.length > 0 && name !== group.name) onRename(name);
        else setValue(group.name);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(group.name);
          event.currentTarget.blur();
        }
      }}
      disabled={disabled}
      aria-label={`Rename ${group.name}`}
      maxLength={60}
      className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs hover:border-border focus-visible:border-border focus-visible:outline-none disabled:opacity-60"
    />
  );
}
