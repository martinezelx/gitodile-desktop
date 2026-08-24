import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, PanelLeft } from "lucide-react";

import { handlePopupMenuKeyDown, usePortalFlyout } from "../shared/ui";
import type { NavigationDisplayMode } from "../features/settings";

export type RailNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  isDisabled: boolean;
  /** Selected in Settings to stay in the rail when height allows it. An item
   * that is not selected remains reachable in More. */
  isVisibleInRail: boolean;
  /** Why the destination is unavailable — "Changes — Open a project first",
   * or "Recovery — Coming soon". Replaces the plain label as the accessible
   * name without adding a tooltip over the narrow sidebar. */
  disabledLabel?: string;
  onSelect?: () => void;
};

type RailNavProps = {
  ariaLabel: string;
  moreLabel: string;
  customizeLabel: string;
  items: RailNavItem[];
  displayMode: NavigationDisplayMode;
  onCustomize: () => void;
};

function RailItemContent({
  item,
  hideLabel,
}: {
  item: RailNavItem;
  hideLabel: boolean;
}): React.JSX.Element {
  return (
    <>
      <span className="rail-item__icon" aria-hidden="true">{item.icon}</span>
      <span className="rail-item__label" aria-hidden={hideLabel || undefined}>{item.label}</span>
    </>
  );
}

/**
 * A Slack-style adaptive destination rail. The visible destinations keep
 * their order, while the suffix that no longer fits moves into More instead
 * of making this short, icon-led navigation scroll. The hidden measurement
 * copy has no semantics or pointer behaviour; it only lets translated labels
 * determine their real height rather than encoding viewport breakpoints.
 */
export function RailNav({
  ariaLabel,
  moreLabel,
  customizeLabel,
  items,
  displayMode,
  onCustomize,
}: RailNavProps): React.JSX.Element {
  const navRef = useRef<HTMLElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const measurementItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const measurementMoreRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const preferredItems = items.filter((item) => item.isVisibleInRail);
  const visibleCountRef = useRef(preferredItems.length);
  const [visibleCount, setVisibleCount] = useState(preferredItems.length);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const hideLabels = displayMode === "icons-only";
  const measurementKey = preferredItems
    .map((item) => `${item.id}\u0000${item.label}`)
    .join("\u0001") + `\u0002${displayMode}`;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measurement = measurementRef.current;
    if (!nav || !measurement) {
      return undefined;
    }

    const measure = (): void => {
      const availableHeight = nav.clientHeight;
      const itemHeights = preferredItems.map(
        (_, index) => measurementItemRefs.current[index]?.offsetHeight ?? 0,
      );
      const moreHeight = measurementMoreRef.current?.offsetHeight ?? 0;
      // jsdom and an element waiting for its first layout both report zero.
      // Keep the complete rail until a truthful measurement exists.
      // The test DOM also gives every element the same synthetic viewport-size
      // box; that is not a possible laid-out rail item, so it is equally
      // non-authoritative.
      const hasSyntheticEqualBoxes =
        moreHeight >= availableHeight && itemHeights.every((height) => height >= availableHeight);
      if (
        availableHeight <= 0 ||
        moreHeight <= 0 ||
        itemHeights.some((height) => height <= 0) ||
        hasSyntheticEqualBoxes
      ) {
        return;
      }

      const measuredGap = Number.parseFloat(
        getComputedStyle(nav).getPropertyValue("--rail-nav-gap"),
      );
      const gap = Number.isFinite(measuredGap) ? measuredGap : 6;
      let nextVisibleCount = 0;
      let usedHeight = moreHeight;
      for (const itemHeight of itemHeights) {
        const nextHeight = usedHeight + gap + itemHeight;
        if (nextHeight > availableHeight) {
          break;
        }
        usedHeight = nextHeight;
        nextVisibleCount += 1;
      }

      if (nextVisibleCount !== visibleCountRef.current) {
        visibleCountRef.current = nextVisibleCount;
        setVisibleCount(nextVisibleCount);
        setIsMoreOpen(false);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(measurement);
    return () => observer.disconnect();
  }, [measurementKey]);

  const safeVisibleCount = Math.min(visibleCount, preferredItems.length);
  const visibleItems = preferredItems.slice(0, safeVisibleCount);
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  // Preserve registry order inside More whether an item was moved there by
  // the user or by the available height.
  const overflowItems = items.filter((item) => !visibleIds.has(item.id));
  const moreIsActive = overflowItems.some((item) => item.isActive);
  const closeMore = (restoreFocus: boolean): void => {
    setIsMoreOpen(false);
    if (restoreFocus) moreTriggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(
    isMoreOpen,
    moreTriggerRef,
    closeMore,
    "side",
  );
  const chooseItem = (item: RailNavItem): void => {
    closeMore(true);
    item.onSelect?.();
  };
  const customize = (): void => {
    closeMore(true);
    onCustomize();
  };

  return (
    <nav
      ref={navRef}
      className={`rail-nav${hideLabels ? " rail-nav--icons-only" : ""}`}
      aria-label={ariaLabel}
    >
      {visibleItems.map((item) => (
        <button
          key={item.id}
          className={`rail-item${item.isActive ? " rail-item--active" : ""}`}
          type="button"
          disabled={item.isDisabled}
          aria-current={item.isActive ? "page" : undefined}
          aria-label={item.disabledLabel ?? (hideLabels ? item.label : undefined)}
          onClick={item.onSelect}
        >
          <RailItemContent item={item} hideLabel={hideLabels} />
        </button>
      ))}

      <button
        ref={moreTriggerRef}
        className={`rail-item rail-item--more${moreIsActive ? " rail-item--active" : ""}`}
        type="button"
        aria-label={moreLabel}
        aria-haspopup="menu"
        aria-expanded={isMoreOpen}
        aria-current={moreIsActive ? "page" : undefined}
        onClick={() => (isMoreOpen ? closeMore(true) : setIsMoreOpen(true))}
      >
        <span className="rail-item__icon" aria-hidden="true"><Ellipsis /></span>
        <span className="rail-item__label">{moreLabel}</span>
      </button>

      <div ref={measurementRef} className="rail-nav__measure" aria-hidden="true">
        {preferredItems.map((item, index) => (
          <div
            key={item.id}
            ref={(element) => {
              measurementItemRefs.current[index] = element;
            }}
            className="rail-item"
          >
            <RailItemContent item={item} hideLabel={hideLabels} />
          </div>
        ))}
        <div ref={measurementMoreRef} className="rail-item">
          <span className="rail-item__icon"><Ellipsis /></span>
          <span className="rail-item__label" aria-hidden={hideLabels || undefined}>{moreLabel}</span>
        </div>
      </div>

      {isMoreOpen && createPortal(
        <div
          ref={popupRef}
          className="app-menu rail-more__menu"
          role="menu"
          aria-label={moreLabel}
          style={style}
          onKeyDown={(event) =>
            handlePopupMenuKeyDown(event, popupRef.current, () => closeMore(true))
          }
        >
          {overflowItems.map((item) => (
            <button
              key={item.id}
              className={`app-menu__item${item.isActive ? " app-menu__item--selected" : ""}`}
              type="button"
              role="menuitem"
              disabled={item.isDisabled}
              aria-current={item.isActive ? "page" : undefined}
              aria-label={item.disabledLabel}
              onClick={() => chooseItem(item)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          {overflowItems.length > 0 && <div className="rail-more__divider" role="separator" />}
          <button
            className="app-menu__item rail-more__customize"
            type="button"
            role="menuitem"
            onClick={customize}
          >
            <PanelLeft aria-hidden="true" />
            <span>{customizeLabel}</span>
          </button>
        </div>,
        document.body,
      )}
    </nav>
  );
}
