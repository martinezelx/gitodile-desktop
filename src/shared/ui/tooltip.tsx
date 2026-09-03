import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Default tooltip for the whole app: put the text in `data-tooltip` on any
 * element (button, span, …) and this single delegated listener + portal
 * picks it up automatically — no per-element wiring needed. Portaling to
 * `document.body` with `position: fixed` means it's never clipped by a
 * scrolling ancestor (e.g. the sidebar) and always renders above everything
 * else, which the old per-element CSS `::after` tooltip couldn't guarantee. */

const SHOW_DELAY_MS = 150;
const VIEWPORT_MARGIN = 8;

interface TooltipState {
  text: string;
  rect: DOMRect;
}

interface TooltipPlacement {
  above: boolean;
  left: number;
  top: number;
  /** The state this placement belongs to. A tooltip moving from one control to
   * another renders once before its layout effect re-measures, and a placement
   * left over from the previous control would put that render at the wrong
   * coordinates on the wrong side — which also restarts the entry animation
   * when the side turns out to differ. Matching on identity makes a stale
   * placement indistinguishable from no placement, which is the safe state. */
  measuredFor: TooltipState;
}

/** A tooltip that only repeats text the element already shows in full is
 * noise — it fires on every hover and tells the reader nothing new. The
 * common case is truncated text (a long path with an ellipsis), where the
 * tooltip *is* the only way to read the rest, so it stays there: same text
 * is only redundant while the element isn't clipped. */
function isRedundant(target: HTMLElement, text: string): boolean {
  if (target.textContent?.trim() !== text.trim()) return false;
  const isClipped =
    target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1;
  return !isClipped;
}

/** Whether focus landed on `target` in a way that is asking for its label.
 *
 * `focusin` fires for a mouse click as readily as for Tab, so wiring it
 * straight to the show path means every click on a control re-arms the tooltip
 * that `pointerdown` had just dismissed: it returns 150ms later, under a
 * pointer already resting on the thing it describes. Fifty-odd controls carry
 * `data-tooltip`, so that was every one of them.
 *
 * `:focus-visible` is exactly this distinction and the browser already owns
 * it: Chromium does not match it for a pointer click, and does for Tab. jsdom's
 * selector engine may not know the pseudo-class, so a throw falls back to
 * showing the tooltip rather than silently suppressing it everywhere. */
function isKeyboardFocus(target: HTMLElement): boolean {
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function TooltipHost(): React.JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let showTimer: number | undefined;
    let activeTarget: HTMLElement | null = null;
    // The control a tooltip is counting down for. Separate from `activeTarget`,
    // which is the one already showing: both have to be recognised as "this
    // hover is already accounted for".
    let pendingTarget: HTMLElement | null = null;

    const clearShowTimer = () => {
      if (showTimer !== undefined) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
      }
    };

    const clearTooltip = () => {
      clearShowTimer();
      activeTarget = null;
      pendingTarget = null;
      setState(null);
    };

    const onOver = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
      // `mouseover` bubbles, so it fires again every time the pointer crosses
      // from one descendant of a control to another — the glyph inside a
      // button, one `<path>` inside that glyph. That is the same hover, not a
      // new one, and restarting the countdown for it is what made a tooltip
      // blink under a pointer that had barely moved.
      if (target === activeTarget || target === pendingTarget) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      if (isRedundant(target, text)) return;
      clearShowTimer();
      pendingTarget = target;
      showTimer = window.setTimeout(() => {
        pendingTarget = null;
        if (!target.isConnected) return;
        activeTarget = target;
        setState({ text, rect: target.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    };

    const onFocusIn = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target || !isKeyboardFocus(target)) return;
      onOver(event);
    };

    const onOut = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
      // The other half of the same problem: `mouseout` bubbles too, so it also
      // reports the pointer leaving a child for its sibling. Only a departure
      // from the control itself ends the tooltip. `relatedTarget` is where the
      // pointer went — or, for `focusout`, where focus went — and it is null
      // when it left the window entirely, which does end it.
      const next = (event as MouseEvent | FocusEvent).relatedTarget;
      if (next instanceof Node && target.contains(next)) return;
      clearTooltip();
    };

    const onDocumentChange = () => {
      if (activeTarget && (!activeTarget.isConnected || !activeTarget.hasAttribute("data-tooltip"))) {
        clearTooltip();
      }
    };

    const observer = new MutationObserver(onDocumentChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tooltip"],
    });

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onOut);
    document.addEventListener("pointerdown", clearTooltip, true);
    document.addEventListener("keydown", clearTooltip, true);
    document.addEventListener("visibilitychange", clearTooltip);
    window.addEventListener("scroll", clearTooltip, true);
    window.addEventListener("resize", clearTooltip);
    window.addEventListener("blur", clearTooltip);
    return () => {
      clearShowTimer();
      observer.disconnect();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("pointerdown", clearTooltip, true);
      document.removeEventListener("keydown", clearTooltip, true);
      document.removeEventListener("visibilitychange", clearTooltip);
      window.removeEventListener("scroll", clearTooltip, true);
      window.removeEventListener("resize", clearTooltip);
      window.removeEventListener("blur", clearTooltip);
    };
  }, []);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!state || !tooltip) return;

    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const centerX = state.rect.left + state.rect.width / 2;
    const halfWidth = width / 2;
    const left = Math.min(
      Math.max(centerX, VIEWPORT_MARGIN + halfWidth),
      window.innerWidth - VIEWPORT_MARGIN - halfWidth,
    );
    const spaceAbove = state.rect.top - VIEWPORT_MARGIN;
    const spaceBelow = window.innerHeight - state.rect.bottom - VIEWPORT_MARGIN;
    const above = spaceAbove >= height || spaceAbove >= spaceBelow;
    const top = above
      ? state.rect.top - VIEWPORT_MARGIN
      : state.rect.bottom + VIEWPORT_MARGIN;

    setPlacement({ above, left, top, measuredFor: state });
  }, [state]);

  if (!state) return null;

  // Anything measured for a previous tooltip is not an answer for this one.
  const resolved = placement?.measuredFor === state ? placement : null;
  // The direction class carries the entry animation, so it waits for the
  // measurement rather than guessing a side. Naming one before it is known
  // starts `tooltip-in-below` on the hidden pass and then restarts it as
  // `tooltip-in-above` once the real side lands — two entry animations for one
  // tooltip. Unclassed, the hidden pass animates nothing and the visible pass
  // animates once.
  const direction = resolved
    ? resolved.above
      ? " app-tooltip--above"
      : " app-tooltip--below"
    : "";

  return createPortal(
    <div
      ref={tooltipRef}
      className={`app-tooltip${direction}`}
      style={{
        left: resolved?.left ?? 0,
        top: resolved?.top ?? 0,
        visibility: resolved ? "visible" : "hidden",
      }}
      role="presentation"
    >
      {state.text}
    </div>,
    document.body,
  );
}
