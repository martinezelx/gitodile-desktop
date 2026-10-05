import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, KeyRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { autoHideScrollbarProps, HostingProviderIcon, RefreshIconButton, usePortalFlyout } from "../../shared/ui";
import type { AccountCatalog } from "./domain";

/** Clone and project preferences share this control. Focus stays on the
 * combobox; moving its active descendant previews a choice until confirmed. */
export function AccountPicker({ catalog, provider, value, onChange, onCheck, disabled = false, failed = false, required = false, label, showHelp = true }: {
  catalog: AccountCatalog; provider: string; value: string | null;
  onChange: (accountId: string | null) => void; onCheck: () => void;
  disabled?: boolean; failed?: boolean; required?: boolean; label?: string; showHelp?: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const accounts = catalog.accounts.filter(account => account.provider === provider);
  const selected = accounts.find(account => account.id === value);
  const missing = value !== null && !selected;
  const blocked = disabled || catalog.busy;
  const isOpen = openProvider === provider && !blocked;
  const fieldLabel = label ?? `${t.accountsProjectLabel} · ${catalog.providers.find(item => item.id === provider)?.host ?? provider}`;
  const placeholder = required ? t.accountsChoose : t.accountsUseGit;
  const method = (accountId: string): string => accountId.startsWith(`${provider}:token.`) ? t.accountsTokenMethod : t.accountsBrowserMethod;
  const options = [
    { value: null, name: placeholder, detail: "", method: "", disabled: false },
    ...(missing ? [{ value, name: t.accountsUnavailable.replace("{account}", value), detail: "", method: "", disabled: true }] : []),
    ...accounts.map(account => ({ value: account.id, name: `@${account.login}`, detail: account.host,
      method: method(account.id), disabled: !account.available })),
  ];
  const enabled = options.filter(option => !option.disabled);
  const activeIndex = options.findIndex(option => option.value === active && !option.disabled);
  const close = (restoreFocus: boolean): void => {
    setOpenProvider(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below", "none");
  const open = (): void => {
    setActive(enabled.some(option => option.value === value) ? value : null);
    setOpenProvider(provider);
  };
  const choose = (accountId: string | null): void => { onChange(accountId); close(true); };
  useLayoutEffect(() => { if (blocked) setOpenProvider(null); }, [blocked]);
  useLayoutEffect(() => { setOpenProvider(null); }, [provider]);
  useLayoutEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex, id, isOpen]);

  const shown = selected ? `@${selected.login}` : missing ? t.accountsUnavailable.replace("{account}", value) : placeholder;
  return <div className="hosting-account-picker">
    <div className="text-field">
      <label id={`${id}-label`} htmlFor={id}>{fieldLabel}</label>
      <button ref={triggerRef} id={id} type="button" role="combobox"
        className="hosting-account-picker__trigger" disabled={blocked}
        aria-haspopup="listbox" aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-list` : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-labelledby={`${id}-label ${id}-value${selected ? ` ${id}-method` : ""}`}
        aria-describedby={showHelp ? `${id}-help` : undefined}
        onClick={() => isOpen ? close(false) : open()}
        onBlur={() => close(false)}
        onKeyDown={event => {
          if (event.key === "Escape" && isOpen) {
            event.preventDefault(); event.stopPropagation(); close(true); return;
          }
          if (event.key === "Tab") { close(false); return; }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (isOpen && activeIndex >= 0) choose(options[activeIndex].value);
            else open();
            return;
          }
          const current = Math.max(0, enabled.findIndex(option => option.value === active));
          let next: number | null = null;
          if (event.key === "ArrowDown") next = (current + 1) % enabled.length;
          else if (event.key === "ArrowUp") next = (current - 1 + enabled.length) % enabled.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = enabled.length - 1;
          else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const ordered = [...enabled.slice(current + 1), ...enabled.slice(0, current + 1)];
            const match = ordered.find(option => option.name.replace(/^@/, "").toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
            if (match) { event.preventDefault(); if (!isOpen) open(); setActive(match.value); }
            return;
          }
          if (next !== null) {
            event.preventDefault();
            if (!isOpen) open();
            if (isOpen || event.key === "Home" || event.key === "End") setActive(enabled[next].value);
          }
        }}>
        <span className="hosting-account-picker__glyph"><HostingProviderIcon provider={provider} /></span>
        <span id={`${id}-value`} className="hosting-account-picker__identity">
          <span>{shown}</span>
          {selected && <small>{selected.host}{!selected.available && ` · ${t.accountsNeedsCheck}`}</small>}
        </span>
        {selected && <span id={`${id}-method`} className="hosting-account-picker__method">{method(selected.id)}</span>}
        <ChevronDown className="hosting-account-picker__chevron" aria-hidden="true" />
      </button>
      {showHelp && <small id={`${id}-help`}>{t.accountsProjectHelp}</small>}
    </div>
    {isOpen && createPortal(
      <div ref={popupRef} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}
        className="app-menu auto-hide-scrollbar hosting-account-picker__popup" {...autoHideScrollbarProps<HTMLDivElement>()}
        style={{ ...style, width: triggerRef.current?.getBoundingClientRect().width }}
        // Keep focus on the combobox and avoid parent outside-dismiss handlers.
        onMouseDown={event => event.stopPropagation()}>
        {options.map((option, index) => <div key={option.value ?? "default"} id={`${id}-option-${index}`}
          role="option" aria-selected={option.value === value} aria-disabled={option.disabled}
          className={`hosting-account-picker__option${index === activeIndex ? " hosting-account-picker__option--active" : ""}`}
          onMouseDown={event => event.preventDefault()}
          onMouseMove={() => { if (!option.disabled) setActive(option.value); }}
          onClick={() => { if (!option.disabled) choose(option.value); }}>
          <span className="hosting-account-picker__glyph">
            {option.value === null ? <KeyRound aria-hidden="true" /> : <HostingProviderIcon provider={provider} />}
          </span>
          <span className="hosting-account-picker__identity"><span>{option.name}</span>
            {option.detail && <small>{option.detail}{option.disabled && ` · ${t.accountsNeedsCheck}`}</small>}
          </span>
          {option.method && <span className="hosting-account-picker__method">{option.method}</span>}
          <span className="hosting-account-picker__selection">{option.value === value && <Check aria-hidden="true" />}</span>
        </div>)}
      </div>,
      // Stay inside aria-modal while escaping the scrolling form body.
      triggerRef.current?.closest('[role="dialog"]') ?? document.body,
    )}
    <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={catalog.busy}
      disabled={blocked} onClick={onCheck} />
    {failed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{t.accountsFailed}</p>}
    {accounts.length === 0 && <p className="settings-row__hint">{t.accountsEmpty}</p>}
  </div>;
}
