import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";

import { isReducedMotionRequested, usePortalFlyout } from "../../shared/ui";
import type { Translations } from "../../i18n";

/** How long the portal outlives a close so the exit animation can play. Kept
 * level with the stylesheet's `changes-diff-find-out` duration. */
const EXIT_MS = 100;

/** The find control both diff surfaces carry: a magnifier at rest, and — once
 * opened — a search field that drops below it in a small popover.
 *
 * It used to open *inside* the strip, growing along the row until its 260px
 * ceiling. On a narrow diff that pushed the step arrows and the reading picker
 * sideways, so the controls the reader was aiming at moved out from under the
 * pointer exactly when they asked to search. The field is portalled below the
 * magnifier instead — `usePortalFlyout` — so the row never moves and the
 * header's own `overflow: hidden` cannot clip it.
 *
 * Shared rather than copied because Changes and History read the same diffs and
 * want the same control in the same place. The query is owned by the host, so
 * switching files does not have to reset it unless the host says so, and the
 * highlight is applied by `DiffResultView`. */
export function DiffFind({ isOpen, query, onQueryChange, onOpen, onClose, t }: {
  isOpen: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
  t: Translations;
}): React.JSX.Element {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  // The portal outlives `isOpen` by one exit so the field leaves the way it
  // arrived rather than blinking out. `usePortalFlyout` reads this rather than
  // `isOpen`, so its position and listeners hold for the length of the exit.
  const [isMounted, setIsMounted] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return undefined;
    }
    // Nothing to play: unmount at once rather than hold a still box open.
    if (isReducedMotionRequested()) {
      setIsMounted(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setIsMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const closeFind = (restoreFocus: boolean): void => {
    onClose();
    if (restoreFocus) {
      // The magnifier is always mounted, so this lands even as the field
      // unmounts: closing with the keyboard leaves the caret where it started.
      triggerRef.current?.focus();
    }
  };
  // The one popup in the app that is a find box rather than a menu: the reader
  // scrolls the diff to look at the matches, and the magnifier sits in a strip
  // that does not scroll, so an external scroll must not close the field (and a
  // resize re-anchors it rather than dropping the query with it). "below-end"
  // backs it off the magnifier's trailing edge so it never spills past the diff
  // panel's right side.
  const { popupRef, style } = usePortalFlyout(
    isMounted,
    triggerRef,
    closeFind,
    "below-end",
    "first-control",
    false,
  );

  return (
    <>
      <button
        ref={triggerRef}
        className="changes-diff__step"
        type="button"
        aria-label={t.changesSearchDiffAriaLabel}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        data-tooltip={t.changesSearchDiffAriaLabel}
        onClick={() => (isOpen ? closeFind(true) : onOpen())}
      >
        <Search aria-hidden="true" />
      </button>
      {isMounted && createPortal(
        <div
          ref={popupRef}
          id={popupId}
          className="search-box changes-diff-find"
          role="search"
          aria-label={t.changesSearchDiffAriaLabel}
          // Out of the accessibility tree and the tab order the moment it
          // starts leaving, so a mid-exit field is never announced, focused or
          // reached by Tab while it animates.
          aria-hidden={isOpen ? undefined : true}
          inert={isOpen ? undefined : true}
          data-state={isOpen ? "open" : "closed"}
          style={style}
        >
          <label className="search-box__field">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder={t.changesSearchDiffPlaceholder}
              aria-label={t.changesSearchDiffAriaLabel}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>
          <button
            className="search-box__clear"
            type="button"
            aria-label={t.commonClose}
            onClick={() => closeFind(true)}
          >
            <X aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
