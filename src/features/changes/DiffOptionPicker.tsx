import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { handlePopupMenuKeyDown, useAnchoredPopup } from "../../shared/ui";

export type DiffPickerOption<Value extends string> = {
  value: Value;
  label: string;
  icon: React.ReactNode;
};

/** The one picker shape the Changes diff language uses: a pill trigger showing
 * the current choice, and an anchored menu of the rest. Shared rather than
 * copied, so the reading-mode picker in the toolbar and the picture pickers
 * inside the diff are the same control, not two things that look alike. */
export function DiffOptionPicker<Value extends string>({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: Value;
  options: readonly DiffPickerOption<Value>[];
  /** Names the control itself; the current choice is appended for anyone
   * reading it out, so the trigger says what it is and what it is set to. */
  ariaLabel: string;
  onChange: (value: Value) => void;
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
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="changes-view-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="version-line-selector changes-view-picker__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${ariaLabel} (${selected.label})`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="version-line-selector__icon" aria-hidden="true">
          {selected.icon}
        </span>
        <span className="changes-view-picker__value">{selected.label}</span>
        <ChevronDown aria-hidden="true" className="version-line-selector__chevron" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="app-menu changes-view-picker__menu"
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={(event) => handlePopupMenuKeyDown(event, menuRef.current, () => closeMenu(false))}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={value === option.value}
              className={`app-menu__item${value === option.value ? " app-menu__item--selected" : ""}`}
              onClick={() => {
                closeMenu(false);
                onChange(option.value);
                triggerRef.current?.focus();
              }}
            >
              {option.icon}
              {option.label}
              {value === option.value && <Check aria-hidden="true" className="app-menu__check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
