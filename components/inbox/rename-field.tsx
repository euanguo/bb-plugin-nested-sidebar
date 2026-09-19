/**
 * The inline name editor, shared by every level that renames in place.
 *
 * Renaming is the one edit this sidebar makes in a row rather than in a dialog,
 * and the reason is the row itself: the thing being renamed is right there, and
 * a modal for a one-word change costs a decision the user did not need to make.
 * The worktree alias already worked this way; threads now do too.
 *
 * The rules are shared rather than repeated, so a level cannot rename
 * differently from its neighbour:
 *
 * - **Enter commits, Escape cancels, and a blur commits.** Leaving the field is
 *   not a way to lose what was typed — that is the behaviour every inline editor
 *   has, and a cancel-on-blur would quietly discard a rename the user had
 *   finished typing.
 * - **`done` latches on the first finish.** Committing re-renders the row, which
 *   unmounts the input, which fires its blur; without the latch that blur would
 *   commit a second time.
 * - **An empty draft is not a rename.** `onCommit` receives the raw draft and the
 *   caller's own intent rule decides, so "cleared the field" cannot silently
 *   become "rename it to nothing".
 * - **The pointer does not reach the row underneath.** The row is a full-bleed
 *   anchor, so a click inside the field would otherwise navigate away from the
 *   thing being edited.
 */

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function RenameField({
  initial,
  ariaLabel,
  placeholder,
  maxLength = 200,
  icon = null,
  inputRef,
  onCommit,
  onCancel,
}: {
  initial: string;
  ariaLabel: string;
  /** Shown as help text. What the user types replaces what is shown. */
  placeholder?: string;
  maxLength?: number;
  /** A leading glyph, for the rows that have room for one. */
  icon?: IconName | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  onCommit: (draft: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);
  /**
   * An id and a name, because the field is a form control.
   *
   * `aria-label` names it for a screen reader, which is not the same thing: the
   * browser's own form-field heuristics want an `id` to associate a label with
   * and a `name` to identify the control, and DevTools reported this field — and
   * only this field — during the regression run. `useId` rather than a constant,
   * because several rows can have a field mounted at once.
   */
  const fieldId = useId();
  const ownRef = useRef<HTMLInputElement | null>(null);
  /**
   * Whether this field has actually held focus yet.
   *
   * A blur before that is not the user leaving — it is the menu's own focus
   * restore arriving late — and committing on it closed the field the instant it
   * opened. Verified in the running app: the first version of this fix grabbed
   * focus, lost it to Radix a frame later, and the commit-on-blur rule unmounted
   * the field before the user could type in it.
   */
  const heldFocus = useRef(false);

  /**
   * Take the focus, and keep taking it while the menu gives it away.
   *
   * `autoFocus` alone loses a race that is always lost here: the field mounts
   * inside a menu that is closing, and Radix restores focus to the menu trigger
   * *after* the field mounts. A single attempt loses too, for the same reason, so
   * this insists for a short window — re-grabbing whenever the focus has moved —
   * and only then records whether it holds. The window is 200ms: long enough to
   * outlast the restore, short enough that a user cannot type into a field that
   * is still fighting for the caret. Selecting means typing replaces a title
   * rather than appending to it, which is what a rename almost always means.
   */
  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const takeFocus = () => {
      const node = ownRef.current;
      if (node === null) return;
      if (document.activeElement !== node) {
        node.focus();
        node.select();
      }
      if (performance.now() - startedAt < 200) {
        frame = requestAnimationFrame(takeFocus);
        return;
      }
      heldFocus.current = document.activeElement === node;
    };
    frame = requestAnimationFrame(takeFocus);
    return () => cancelAnimationFrame(frame);
  }, []);

  /**
   * One node, two refs: the caller's when it has one, and this component's.
   *
   * The caller's is how a row puts the field back where it was after a remount,
   * and it is optional; the internal one is what the focus effect needs. A
   * callback ref serves both without either having to know about the other.
   */
  const setRef = (node: HTMLInputElement | null) => {
    ownRef.current = node;
    if (inputRef !== undefined) inputRef.current = node;
  };

  const finish = (commit: boolean) => {
    if (done) return;
    setDone(true);
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    // `pointer-events-auto` because the row that hosts this field is a
    // full-bleed anchor's parent: a thread row's title sits inside a
    // `pointer-events-none` container so the anchor underneath receives the
    // press. The field has to opt back in, or it would render but never focus.
    <span className="pointer-events-auto relative z-10 flex min-w-0 flex-1 items-center gap-1.5">
      {icon === null ? null : (
        <Icon
          name={icon}
          className="size-3 shrink-0 text-muted-foreground/60"
          aria-hidden
        />
      )}
      <input
        ref={setRef}
        id={fieldId}
        name="nest-name"
        value={value}
        maxLength={maxLength}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => setValue(event.currentTarget.value)}
        // A press inside the field must not reach the row's anchor: the anchor
        // is what opens the thread, and opening it while renaming it is the one
        // way this edit can lose its own subject.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        onBlur={() => {
          // A blur before this field has ever held focus is the menu's restore,
          // not the user leaving. Committing on it unmounted the field the
          // instant it opened.
          if (!heldFocus.current) return;
          finish(true);
        }}
        className={cn(
          "h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-xs",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
      />
    </span>
  );
}