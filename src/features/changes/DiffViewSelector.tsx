import { useRef, useState } from "react";
import { Check, ChevronDown, Columns2, FileText, Rows3 } from "lucide-react";

import type { Translations } from "../../i18n";
import { handlePopupMenuKeyDown, useAnchoredPopup } from "../../shared/ui";
import type { DiffViewMode } from "./DiffResultView";

const VIEW_MODE_LABEL_KEYS = {
  unified: "changesViewUnified",
  split: "changesViewSplit",
  accessible: "changesViewAccessible",
} as const satisfies Record<DiffViewMode, keyof Translations>;

/** Shared picker for every surface that renders the Changes diff language. */
export function DiffViewSelector({
  value,
  onChange,
  t,
}: {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
  t: Translations;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };
  const { containerRef, popupRef: menuRef } = useAnchoredPopup(
    isOpen,
    triggerRef,
    closeMenu,
    "selected-menu-item",
  );

  return (
    <div className="changes-view-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="version-line-selector changes-view-picker__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t.changesViewAriaLabel} (${t[VIEW_MODE_LABEL_KEYS[value]]})`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {value === "split" ? (
          <Columns2 aria-hidden="true" className="version-line-selector__icon" />
        ) : value === "accessible" ? (
          <FileText aria-hidden="true" className="version-line-selector__icon" />
        ) : (
          <Rows3 aria-hidden="true" className="version-line-selector__icon" />
        )}
        <span className="changes-view-picker__value">{t[VIEW_MODE_LABEL_KEYS[value]]}</span>
        <ChevronDown aria-hidden="true" className="version-line-selector__chevron" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="app-menu changes-view-picker__menu"
          role="menu"
          aria-label={t.changesViewAriaLabel}
          onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => closeMenu(false))}
        >
          {(["unified", "split", "accessible"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={value === mode}
              className={`app-menu__item${value === mode ? " app-menu__item--selected" : ""}`}
              onClick={() => {
                closeMenu(false);
                onChange(mode);
                triggerRef.current?.focus();
              }}
            >
              {mode === "split" ? (
                <Columns2 aria-hidden="true" />
              ) : mode === "accessible" ? (
                <FileText aria-hidden="true" />
              ) : (
                <Rows3 aria-hidden="true" />
              )}
              {t[VIEW_MODE_LABEL_KEYS[mode]]}
              {value === mode && <Check aria-hidden="true" className="app-menu__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
