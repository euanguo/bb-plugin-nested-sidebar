/**
 * The last good answer from each of this plugin's own reads, held outside React.
 *
 * bb renders a different component for the settings routes, so the whole thread
 * list unmounts on the way in and comes back with every piece of local state
 * reset. Each store below reads from an effect and starts from an empty value,
 * so that remount paints the empty state for one round trip and then snaps to
 * the real one. For groups that is the flash the user sees: with no groups and
 * no assignment every project falls into the implicit Ungrouped view for a
 * frame, then jumps into its group.
 *
 * Nothing below the hook remembers either — `rpc.call` is a plain `fetch` with
 * no cache — so the gap is the round trip itself and no amount of retrying
 * closes it. A snapshot does, by giving the remount its previous value as the
 * initial state. The read still runs on every mount and still owns the truth;
 * this only decides what the frame before it paints.
 *
 * Memory only, and that is the whole design rather than an omission. The defect
 * is the remount, and module scope is what outlives one — a page load does not
 * unmount anything, so persisting would buy a cold start nothing and cost a
 * decode boundary on `localStorage`, which is user-writable and shared with
 * every other script on the origin. The two stores where a cold start genuinely
 * misreads data, lifecycle rows and provider logos, already persist for exactly
 * that reason in `lib/warm-start.ts`; these carry arrangement, where a stale
 * frame is a moment of the wrong order and never a wrong fact.
 *
 * A snapshot is never authoritative. It is dropped on nothing, because the read
 * that replaces it always follows, and a failed read leaves the last good value
 * standing rather than blanking a list the user was looking at.
 */

const snapshots = new Map<string, unknown>();

export interface StoreSnapshot<T> {
  /** The last value written, or undefined when nothing has been. */
  read(): T | undefined;
  write(value: T): void;
}

/**
 * One named slot. Call once at module scope, so the handle is created once for
 * the life of the page rather than on every render.
 */
export function defineStoreSnapshot<T>(key: string): StoreSnapshot<T> {
  return {
    read: () => snapshots.get(key) as T | undefined,
    write: (value) => {
      snapshots.set(key, value);
    },
  };
}

/**
 * Drops every slot. Only a test needs this — surviving is the entire point —
 * but tests in one file share this module.
 */
export function resetStoreSnapshotsForTests(): void {
  snapshots.clear();
}
