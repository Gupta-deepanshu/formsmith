"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth (eased) wheel scrolling for the marketing pages only: `/` and `/demo`.
 *
 * Mount it on a page, not in a layout: it lives only while that page is open and is
 * destroyed on navigation, so the editor, public form and responses table (nested scroll
 * areas, virtualised rows, dialogs, programmatic focus/scrollIntoView) keep native scroll.
 * See docs/decisions.md.
 *
 * - Not started at all under `prefers-reduced-motion` (and torn down if the user turns it
 *   on mid-visit), so those users get plain native scrolling.
 * - Touch keeps native scrolling (Lenis default `syncTouch: false`); keyboard scrolling is
 *   native too.
 * - `allowNestedScroll`: any scrollable element inside the page (e.g. a dialog body)
 *   scrolls itself instead of the page.
 * - `anchors` left off: the skip link and in-page anchors jump natively, which also moves
 *   focus, which is what keyboard and screen-reader users need.
 */
export function SmoothScroll() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | null = null;

    const sync = () => {
      if (reduced.matches) {
        lenis?.destroy();
        lenis = null;
      } else if (!lenis) {
        lenis = new Lenis({ autoRaf: true, allowNestedScroll: true });
      }
    };

    sync();
    reduced.addEventListener("change", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      lenis?.destroy();
    };
  }, []);

  return null;
}
