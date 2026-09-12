import { useEffect, useState } from "react";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  useRpc,
  type NewThreadComposerProps,
  type NewThreadRequest,
} from "@get-bb/plugin-sdk/app";
import type { nestRpcContract } from "@/server";
import { Modal } from "@/components/ui/modal";

/**
 * The environment seed shape, borrowed from the host composer's own prop rather
 * than redeclared: it is exactly what that prop accepts, and the SDK does not
 * export the underlying type by name.
 */
type CreateThreadEnvironmentArgs = NonNullable<
  NewThreadComposerProps["defaultEnvironment"]
>;

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
 *
 * The dialog is only ever open when there is a seed, and it closes through the
 * shared modal's unconditional escape hatches, so a composer that renders
 * slowly — or not at all — can never trap the user.
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
  const rpc = useRpc<typeof nestRpcContract>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (seed === null) return;
    setError(null);
    setBusy(false);
    setFocusRequest((value) => value + 1);
  }, [seed]);

  const submit = async (request: NewThreadRequest) => {
    setBusy(true);
    setError(null);
    try {
      const created = await rpc.call("spawnThread", {
        request: { ...request },
      });
      onCreated(created.threadId);
    } catch (caught) {
      // The composer keeps its draft when submit throws, so the user never
      // loses what they typed to a failed create.
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={seed !== null}
      onClose={onClose}
      busy={busy}
      icon="Add"
      title={`New thread in ${seed?.projectName ?? "project"}`}
      subtitle={seed?.originLabel ?? ""}
    >
      {error === null ? null : (
        <p className="mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-2xs text-destructive">
          {error}
        </p>
      )}
      {seed === null ? null : (
        <NewThreadComposer
          // Re-mount on a new seed so the composer re-seeds its pickers from
          // the row the user actually clicked, not the previous one.
          key={`${seed.projectId}:${seed.originLabel}`}
          defaultProjectId={seed.projectId}
          defaultEnvironment={seed.environment}
          layout="document"
          focusRequest={focusRequest}
          draftKey={`nest:new:${seed.projectId}`}
          placeholder="Describe the work for this thread…"
          onSubmit={submit}
        />
      )}
    </Modal>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not create the thread.";
}
