/**
 * Copying, with a result the caller can trust.
 *
 * `navigator.clipboard` is the right API but is unavailable on a non-secure
 * origin and can be refused outright. A sidebar that offers "Copy thread ID"
 * and then silently does nothing is worse than one that never offered it, so
 * this falls back to the selection-based copy and reports whether anything was
 * written.
 */

export const COPY_ANNOUNCEMENT_EVENT = "nest:copy-announcement";

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (text.length === 0) return false;
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through: a refused permission is exactly the case the textarea
      // path still handles.
    }
  }
  return copyViaSelection(text);
}

/**
 * The pre-clipboard-API copy, kept as the fallback.
 *
 * It needs the node to be in the document and selected, so the textarea is
 * appended off-screen, selected, and removed again — never shown, never
 * focusable, and never left behind if the copy throws.
 */
function copyViaSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "-9999px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Tell the sidebar what was copied.
 *
 * The menus live several levels below the surface that owns the live region,
 * and threading a callback through every level would make the tree's props
 * about copy feedback rather than about the tree. One window event keeps the
 * announcement where the region is and the copy where the menu is.
 */
export function announceCopy(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(COPY_ANNOUNCEMENT_EVENT, { detail: message }),
  );
}

/**
 * Copy one value and announce the outcome. `label` names the thing in the
 * message, so "Thread ID copied" and "Thread link copied" stay distinct.
 */
export async function copyWithAnnouncement(
  text: string,
  label: string,
): Promise<boolean> {
  const copied = await copyTextToClipboard(text);
  announceCopy(copied ? `${label} copied` : `${label} could not be copied`);
  return copied;
}
