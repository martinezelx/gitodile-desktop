import React, { useRef, useState } from "react";
import { ListFilter, X } from "lucide-react";

import { handlePopupMenuKeyDown, useAnchoredPopup } from "./popupMenu";

/** Every string the surface draws. Taken as props, like every other module in
 * `shared/ui`: nothing here reaches for the language provider. */
export type FilterPanelLabels = {
  /** Names the trigger while nothing is on. */
  open: string;
  /** Names the trigger while something is: takes the count. */
  active: (count: number) => string;
  /** Said in the footer, beside the way to end it all. */
  activeCount: (count: number) => string;
  clear: string;
};

/** The filters of a list, behind one trigger.
 *
 * The trigger never grows: filters used to be menus that printed their current
 * value into the strip, which cost width in proportion to how many there were,
 * and a list column of ~300px cannot pay that. The count is the whole message —
 * something is on, and this much of it — and the panel says which.
 *
 * ADR 0003's two-consumer bar, met rather than guessed: History and Changes ask
 * the same question of two different lists, and had this been left with the
 * first of them the second would have copied a dozen rules to ask it. What is
 * shared is the surface — the trigger, its count, the panel, the footer, and
 * the groups, capsules and switches a filter is written in. What is filtered is
 * the feature's own and arrives as children, because what there is to narrow is
 * exactly what the two screens do not have in common.
 *
 * The panel is positioned against the strip that opens it rather than against
 * this trigger, which is 24px wide and sits at one end of a search box: the
 * host makes its toolbar the containing block, and the panel then takes that
 * strip's own inset on both sides at every width. */
export function FilterPanel({ activeCount, labels, className, onClear, children }: {
  activeCount: number;
  labels: FilterPanelLabels;
  className?: string;
  onClear: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef } = useAnchoredPopup(isOpen, triggerRef, close, "container");
  const name = activeCount > 0 ? labels.active(activeCount) : labels.open;

  return <div className={`filter-control${className ? ` ${className}` : ""}`} ref={containerRef}>
    <button
      ref={triggerRef}
      className={`filter-control__trigger${activeCount > 0 ? " filter-control__trigger--active" : ""}`}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={name}
      data-tooltip={name}
      onClick={() => setIsOpen((open) => !open)}
    >
      <ListFilter aria-hidden="true" />
      {/* A count, not a dot: the trigger has to say that something is on and how
          much of it, without the panel being open to read — and a filter that
          is narrowing what the reader sees must not be distinguishable by
          colour alone. */}
      {activeCount > 0 && <span className="filter-control__badge" aria-hidden="true">{activeCount}</span>}
    </button>
    {isOpen && <div
      ref={popupRef}
      className="filter-panel"
      role="dialog"
      aria-label={labels.open}
      tabIndex={-1}
      onKeyDown={(event) => handlePopupMenuKeyDown(event, popupRef.current, () => close(true))}
    >
      {children}
      {/* What is on, and the one way to end all of it — a count beside its own
          undo, rather than a button spanning the panel for a state that is
          usually empty. */}
      <footer className="filter-panel__footer">
        <span>{activeCount > 0 ? labels.activeCount(activeCount) : ""}</span>
        <button className="ghost-button" type="button" disabled={activeCount === 0} onClick={onClear}>
          {labels.clear}
        </button>
      </footer>
    </div>}
  </div>;
}

/** One question inside the panel, with the words that name it.
 *
 * A group whose label names a single control takes a `<label>` and points at
 * it; a group whose label names a set of them — capsules, switches — is a
 * `<fieldset>` with a `<legend>`, which is what has the set announced as one
 * question rather than as several unrelated controls. Passing `labelFor` is
 * what says which of the two this is. */
export function FilterGroup({ label, labelFor, children }: {
  label?: string;
  labelFor?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  if (label === undefined) return <div className="filter-panel__group">{children}</div>;
  if (labelFor !== undefined) {
    return <div className="filter-panel__group">
      <label className="filter-panel__label" htmlFor={labelFor}>{label}</label>
      {children}
    </div>;
  }
  return <fieldset className="filter-panel__group">
    <legend className="filter-panel__label">{label}</legend>
    {children}
  </fieldset>;
}

/** A row of capsules: one answer out of a short, fixed set of the same kind of
 * thing — or several of them, where the question takes more than one.
 *
 * `dense` is for a row that has to hold five answers in a panel group of
 * ~276px; it takes 2px off each side of every capsule. Wrapping stays available
 * either way, so a translation longer than the ones measured breaks the row
 * rather than the words.
 *
 * `ariaLabel` names the row where it is the *second* set of controls inside a
 * group — a group's `<legend>` names everything under it, so a row that asks
 * its own question has to say so or be announced under someone else's. */
export function FilterCapsules({ dense, ariaLabel, children }: {
  dense?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return <div
    className={`filter-panel__capsules${dense ? " filter-panel__capsules--dense" : ""}`}
    role={ariaLabel === undefined ? undefined : "group"}
    aria-label={ariaLabel}
  >{children}</div>;
}

/** One capsule. Still a real radio or checkbox underneath — the input is
 * hidden, not replaced — so the grouping a `name` gives a radio set, arrow-key
 * movement within it, and assistive technology all keep working on a control
 * that looks nothing like the platform's. */
export function FilterCapsule({ type = "radio", name, checked, onChange, children }: {
  type?: "radio" | "checkbox";
  name?: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return <label className={`filter-panel__capsule${checked ? " filter-panel__capsule--active" : ""}`}>
    <input className="visually-hidden" type={type} name={name} checked={checked} onChange={onChange} />
    <span>{children}</span>
  </label>;
}

/** One switch: a filter that is on or off, named in full — optionally with the
 * glyph that names the same kind of thing elsewhere on the screen, and with how
 * many rows it stands for. */
export function FilterSwitch({ checked, icon, label, count, onChange }: {
  checked: boolean;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return <label className="filter-panel__switch">
    <input className="app-checkbox" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    {icon}
    <span className="filter-panel__switch-label">{label}</span>
    {count !== undefined && <span className="filter-panel__count">{count}</span>}
  </label>;
}

export type FilterChip = {
  key: string;
  label: string;
  /** A glyph in front of the label, for a chip that names a different kind of
   * thing from the ones beside it. */
  icon?: React.ReactNode;
  title?: string;
  /** Its own name for the remove button, where "remove this filter" is not what
   * pressing it means. */
  removeLabel?: string;
  /** Quieter than the rest: a chip that states context rather than a filter. */
  quiet?: boolean;
  onRemove: () => void;
};

/** What is narrowing the list, under the strip that set it, each one removable
 * on its own. The trigger's badge says how many; these say which — and a row of
 * their own is what lets them, where chips inside the search pill would take
 * the width from the field they sit in. Renders nothing when nothing is on. */
export function FilterChips({ chips, removeLabel }: {
  chips: FilterChip[];
  removeLabel: (label: string) => string;
}): React.JSX.Element | null {
  if (chips.length === 0) return null;
  return <div className="filter-chips">
    {chips.map((chip) => (
      <span key={chip.key} className={`filter-chip${chip.quiet ? " filter-chip--quiet" : ""}`}>
        {chip.icon}
        <span className="filter-chip__label" title={chip.title ?? chip.label}>{chip.label}</span>
        <button
          type="button"
          className="filter-chip__remove"
          aria-label={chip.removeLabel ?? removeLabel(chip.label)}
          onClick={chip.onRemove}
        >
          <X aria-hidden="true" />
        </button>
      </span>
    ))}
  </div>;
}
