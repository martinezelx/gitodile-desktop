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

export function TooltipHost(): React.JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let showTimer: number | undefined;
    let activeTarget: HTMLElement | null = null;

    const clearShowTimer = () => {
      if (showTimer !== undefined) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
      }
    };

    const clearTooltip = () => {
      clearShowTimer();
      activeTarget = null;
      setState(null);
    };

    const onOver = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
      const text = target.getAttribute("data-tooltip");
      if (!text) return;
      if (isRedundant(target, text)) return;
      clearShowTimer();
      showTimer = window.setTimeout(() => {
        if (!target.isConnected) return;
        activeTarget = target;
        setState({ text, rect: target.getBoundingClientRect() });
      }, SHOW_DELAY_MS);
    };

    const onOut = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-tooltip]");
      if (!target) return;
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
    document.addEventListener("focusin", onOver);
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
      document.removeEventListener("focusin", onOver);
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

    setPlacement({ above, left, top });
  }, [state]);

  if (!state) return null;

  const above = placement?.above ?? false;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`app-tooltip${above ? " app-tooltip--above" : " app-tooltip--below"}`}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        visibility: placement ? "visible" : "hidden",
      }}
      role="presentation"
    >
      {state.text}
    </div>,
    document.body,
  );
}
