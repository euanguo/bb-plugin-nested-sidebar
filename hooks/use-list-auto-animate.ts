import { useCallback } from "react";
import { autoAnimate } from "@formkit/auto-animate";

/**
 * The list transitions for the tree's row containers.
 *
 * Ported from BB Sidebar (`src/ThreadInbox.tsx`, `useListAutoAnimate`); see
 * THIRD_PARTY_NOTICES.md.
 *
 * The upstream hook also keeps a module-level registry of live controllers and
 * a counted suspend/resume, because its reorder drag reads insertion position
 * from row geometry while rows may be mid-flight, and an animating rect reports
 * where a row WAS rather than the slot the order has already given it.
 *
 * Nest does not need either. It reorders with native HTML5 drag-and-drop: no
 * row moves in the DOM during the gesture, and `before`/`after` is decided in
 * the drop handler from the target row's own (static) box. There is nothing to
 * hold still, so the registry and both functions are dropped rather than
 * ported as dead weight.
 */
export function useListAutoAnimate<T extends HTMLElement>() {
  return useCallback((node: T | null) => {
    if (!node || typeof window.matchMedia !== "function") return;
    const animation = autoAnimate(node, {
      duration: 150,
      easing: "ease-out",
    });
    return () => {
      // Dropping our reference is not enough: auto-animate holds the parent in
      // its own registry and keeps observers and a polling interval alive until
      // it is told to let go.
      animation.destroy?.();
    };
  }, []);
}
