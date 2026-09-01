import React, { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useLanguage } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";

export type AppCommand = {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
};

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  contextKey,
}: {
  isOpen: boolean;
  onClose: () => void;
  commands: AppCommand[];
  /** Changing projects invalidates the action list and dismisses the transient
   * palette even when the switch came from somewhere other than the palette. */
  contextKey?: string | null;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousContextKeyRef = useRef(contextKey);
  const filtered = commands.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (previousContextKeyRef.current !== contextKey && isOpen) {
      onClose();
    }
    previousContextKeyRef.current = contextKey;
  }, [contextKey, isOpen, onClose]);

  if (!isOpen) return null;

  const runCommand = (command: AppCommand | undefined): void => {
    if (!command) return;
    onClose();
    command.action();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") onClose();
    else if (event.key === "Tab") event.preventDefault();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(filtered[selectedIndex]);
    }
  };

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t.paletteAriaLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              filtered[selectedIndex] ? `palette-option-${filtered[selectedIndex].id}` : undefined
            }
            aria-autocomplete="list"
            placeholder={t.palettePlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ul
          {...autoHideScrollbarProps<HTMLUListElement>()}
          className="palette-list auto-hide-scrollbar"
          id="palette-list"
          role="listbox"
        >
          {filtered.length === 0 && <li className="palette-empty">{t.paletteNoMatches}</li>}
          {filtered.map((command, index) => (
            <li
              key={command.id}
              id={`palette-option-${command.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              className="palette-item"
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                runCommand(command);
              }}
            >
              {command.label}
              {command.hint && <span className="palette-item__hint">{command.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
