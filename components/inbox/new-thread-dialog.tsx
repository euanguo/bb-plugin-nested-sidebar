import { useEffect, useId, useRef, useState } from "react";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  useRpc,
  type NewThreadComposerProps,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";

/**
 * The environment seed shape, borrowed from the host composer's own prop rather
 * than redeclared: it is exactly what that prop accepts, and the SDK does not
 * export the underlying type by name.
 */
type CreateThreadEnvironmentArgs = NonNullable<
  NewThreadComposerProps["defaultEnvironment"]
>;
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface NewThreadSeed {
  /** Always set: this dialog only exists to create inside a known project. */
  readonly projectId: string;
  readonly projectName: string;
  /** The workspace the user clicked + on, when they clicked a workspace row. */
  readonly environment?: CreateThreadEnvironmentArgs;
  /** Shown in the header so the user can see where the seed came from. */
  readonly originLabel: string;
}

/**
 * The new-thread dialog.
 *
 * bb's own compose surface is reused verbatim — prompt editor, attachments,
 * provider/model/reasoning, environment and branch pickers — and merely
 * framed as a modal seeded from the row the user clicked. That is deliberate:
 * reimplementing the composer would drift from bb's own behaviour, and the
 * host component is the one thing that cannot fall behind it.
 *
 * The seed is a seed, not a lock: the project picker stays editable, and the
 * environment picker can still be pointed at a different worktree — or at a
 * newly created one — from inside the composer.
 */
export function NewThreadDialog({
  seed,
  onClose,
  onCreated,
}: {
  seed: NewThreadSeed | null;
  onClose: () => void;
  onCreated: (threadId: string | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const rpc = useRpc<typeof nestRpcContract>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (seed !== null && !dialog.open) {
      dialog.showModal();
      setFocusRequest((value) => value + 1);
    }
    if (seed === null && dialog.open) dialog.close();
  }, [seed]);

  useEffect(() => {
    if (seed !== null) {
      setError(null);
      setBusy(false);
    }
  }, [seed]);

  const submit = async (request: NewThreadRequest) => {
    setBusy(true);
    setError(null);
    try {
      const created = await rpc.call("spawnThread", {
        request: request as unknown as Record<string, unknown>,
      });
      onCreated(created.threadId);
      dialogRef.current?.close();
    } catch (caught) {
      // The composer keeps its draft when submit throws, so the user never
      // loses what they typed to a failed create.
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (seed !== null && !busy) onClose();
      }}
      className="fixed left-1/2 top-1/2 z-50 m-0 flex max-h-[min(85vh,44rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl backdrop:bg-black/50"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon name="Add" className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xs font-semibold">
            New thread in {seed?.projectName ?? "project"}
          </h2>
          <p className="truncate text-2xs text-muted-foreground">
            {seed?.originLabel ?? ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
        >
          <Icon name="CircleX" className="size-3.5" aria-hidden />
        </button>
      </header>

      {error === null ? null : (
        <p className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-2xs text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {seed === null ? null : (
          <NewThreadComposer
            // Re-mount on a new seed so the composer re-seeds its pickers
            // from the row the user actually clicked, not the previous one.
            key={`${seed.projectId}:${seed.originLabel}`}
            defaultProjectId={seed.projectId}
            defaultEnvironment={seed.environment}
            layout="document"
            focusRequest={focusRequest}
            draftKey={`nested-sidebar:new:${seed.projectId}`}
            placeholder="Describe the work for this thread…"
            onSubmit={submit}
          />
        )}
      </div>
    </dialog>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not create the thread.";
}

export { cn };
