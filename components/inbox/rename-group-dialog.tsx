import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Modal } from "@/components/ui/modal";
import { renameIntent } from "@/lib/groups";

/**
 * Rename a group from the scope strip.
 *
 * The strip's tabs are too small to hold an input, so the in-tab pencil opens
 * this instead; the group *row* in the tree renames in place. Both go through
 * `renameIntent`, so an empty or unchanged draft is dropped in exactly the same
 * way regardless of which affordance the user reached for.
 */
export function RenameGroupDialog({
  groupId,
  currentName,
  onCancel,
  onRenamed,
}: {
  groupId: string;
  currentName: string;
  onCancel: () => void;
  onRenamed: () => void;
}) {
  const rpc = useRpc<typeof nestRpcContract>();
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const name = renameIntent(value, currentName);
    if (name === null) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rpc.call("renameGroup", { groupId, name });
      onRenamed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      busy={busy}
      icon="Edit"
      title="Rename group"
      width="24rem"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-7 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || value.trim().length === 0}
            onClick={() => void submit()}
            className="h-7 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
          >
            {busy ? "Renaming…" : "Rename"}
          </button>
        </div>
      }
    >
      <label className="grid gap-1 text-2xs text-muted-foreground">
        Group name
        <input
          autoFocus
          value={value}
          maxLength={60}
          disabled={busy}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </label>
      {error === null ? null : (
        <p className="mt-2 text-2xs text-destructive">{error}</p>
      )}
    </Modal>
  );
}
