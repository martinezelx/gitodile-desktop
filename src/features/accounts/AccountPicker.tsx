import { Fragment, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, KeyRound, LoaderCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "../../i18n";
import { autoHideScrollbarProps, HostingProviderIcon, usePortalFlyout } from "../../shared/ui";
import { providerKind, type AccountCatalog } from "./domain";

type Option = { value: string | null; name: string; host: string; method: string; disabled: boolean };
/** The menu's last item checks the accounts instead of choosing one. */
const CHECK = "#check-accounts";

/** Clone and project preferences share this control. Focus stays on the
 * combobox; moving its active descendant previews a choice until confirmed.
 * With `kind`, it lists every host of that product (repository discovery) and
 * groups the options under their host. The account check is the menu's last
 * item. `compact` drops the visible label, help and that check for a row whose
 * group owns them. */
export function AccountPicker({ catalog, provider, kind, value, onChange, onCheck, disabled = false, failed = false, required = false, label, showHelp = true, compact = false }: {
  catalog: AccountCatalog; provider: string; kind?: string; value: string | null;
  onChange: (accountId: string | null) => void; onCheck: () => void;
  disabled?: boolean; failed?: boolean; required?: boolean; label?: string; showHelp?: boolean; compact?: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const accounts = catalog.accounts.filter(account => kind
    ? providerKind(catalog.providers, account.provider) === kind : account.provider === provider);
  const iconKind = kind ?? providerKind(catalog.providers, provider);
  const selected = accounts.find(account => account.id === value);
  const missing = value !== null && !selected;
  const blocked = disabled || catalog.busy;
  const isOpen = openProvider === provider && !blocked;
  const fieldLabel = label ?? `${t.accountsProjectLabel} · ${catalog.providers.find(item => item.id === provider)?.host ?? provider}`;
  const placeholder = required ? t.accountsChoose : t.accountsUseGit;
  const method = (accountId: string): string => accountId.includes(":token.") ? t.accountsTokenMethod : t.accountsBrowserMethod;
  const grouped = new Set(accounts.map(account => account.host)).size > 1;
  const builtIn = (id: string): boolean => catalog.providers.find(item => item.id === id)?.builtIn ?? true;
  // A required choice has no "none" option: the trigger shows the prompt.
  const options: Option[] = [
    ...(required ? [] : [{ value: null, name: placeholder, host: "", method: "", disabled: false }]),
    ...(missing ? [{ value, name: t.accountsUnavailable.replace("{account}", value), host: "", method: "", disabled: true }] : []),
    // github.com/gitlab.com first, then company servers by name.
    ...[...accounts].sort((a, b) => !grouped ? 0 : Number(!builtIn(a.provider)) - Number(!builtIn(b.provider)) || a.host.localeCompare(b.host))
      .map(account => ({ value: account.id, name: `@${account.login}`, host: account.host,
        method: method(account.id), disabled: !account.available })),
    ...(compact ? [] : [{ value: CHECK, name: t.accountsCheck, host: "", method: "", disabled: false }]),
  ];
  const enabled = options.filter(option => !option.disabled);
  const activeIndex = options.findIndex(option => option.value === active && !option.disabled);
  const close = (restoreFocus: boolean): void => {
    setOpenProvider(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below", "none");
  const open = (): void => {
    setActive(enabled.some(option => option.value === value) ? value : enabled.find(option => option.value !== CHECK)?.value ?? null);
    setOpenProvider(provider);
  };
  const choose = (accountId: string | null): void => {
    close(true);
    if (accountId === CHECK) onCheck(); else onChange(accountId);
  };
  useLayoutEffect(() => { if (blocked) setOpenProvider(null); }, [blocked]);
  useLayoutEffect(() => { setOpenProvider(null); }, [provider]);
  useLayoutEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex, id, isOpen]);

  const shown = selected ? `@${selected.login}` : missing ? t.accountsUnavailable.replace("{account}", value) : placeholder;
  return <div className={`hosting-account-picker${compact ? " hosting-account-picker--compact" : ""}`}>
    <div className="text-field">
      <label id={`${id}-label`} htmlFor={id} className={compact ? "visually-hidden" : undefined}>{fieldLabel}</label>
      <button ref={triggerRef} id={id} type="button" role="combobox"
        className="hosting-account-picker__trigger" disabled={blocked}
        aria-haspopup="listbox" aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-list` : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-labelledby={`${id}-label ${id}-value${selected ? ` ${id}-method` : ""}`}
        aria-describedby={showHelp && !compact ? `${id}-help` : undefined}
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
          if (enabled.length === 0) return;
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
        <span className="hosting-account-picker__glyph"><HostingProviderIcon provider={iconKind} /></span>
        <span id={`${id}-value`} className="hosting-account-picker__identity">
          <span>{shown}</span>
          {selected && (!compact || !selected.available) && <small>{compact ? t.accountsNeedsCheck : selected.host}{!compact && !selected.available && ` · ${t.accountsNeedsCheck}`}</small>}
        </span>
        {selected && <span id={`${id}-method`} className="hosting-account-picker__method">{method(selected.id)}</span>}
        {catalog.busy ? <LoaderCircle className="hosting-account-picker__chevron icon--spinning" aria-label={t.accountsChecking} />
          : <ChevronDown className="hosting-account-picker__chevron" aria-hidden="true" />}
      </button>
      {showHelp && !compact && <small id={`${id}-help`}>{t.accountsProjectHelp}</small>}
    </div>
    {isOpen && createPortal(
      <div ref={popupRef} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}
        className="app-menu auto-hide-scrollbar hosting-account-picker__popup" {...autoHideScrollbarProps<HTMLDivElement>()}
        style={{ ...style, width: triggerRef.current?.getBoundingClientRect().width }}
        // Keep focus on the combobox and avoid parent outside-dismiss handlers.
        onMouseDown={event => event.stopPropagation()}>
        {accounts.length === 0 && <p className="hosting-account-picker__empty">{t.accountsEmpty}</p>}
        {options.map((option, index) => <Fragment key={option.value ?? "default"}>
          {grouped && option.host && option.host !== options[index - 1]?.host &&
            <div role="presentation" className="hosting-account-picker__group">{option.host}</div>}
          {option.value === CHECK && index > 0 && <div role="presentation" className="hosting-account-picker__separator" />}
          <div id={`${id}-option-${index}`}
            role="option" aria-selected={option.value === value} aria-disabled={option.disabled}
            className={`hosting-account-picker__option${index === activeIndex ? " hosting-account-picker__option--active" : ""}`}
            onMouseDown={event => event.preventDefault()}
            onMouseMove={() => { if (!option.disabled) setActive(option.value); }}
            onClick={() => { if (!option.disabled) choose(option.value); }}>
            <span className="hosting-account-picker__glyph">
              {option.value === null ? <KeyRound aria-hidden="true" /> : option.value === CHECK ? <RefreshCw aria-hidden="true" /> : <HostingProviderIcon provider={iconKind} />}
            </span>
            <span className="hosting-account-picker__identity"><span>{option.name}</span>
              {(option.disabled || (option.host && !grouped)) && <small>{grouped ? "" : option.host}{option.disabled && `${grouped ? "" : " · "}${t.accountsNeedsCheck}`}</small>}
            </span>
            {option.method && <span className="hosting-account-picker__method">{option.method}</span>}
            <span className="hosting-account-picker__selection">{option.value === value && <Check aria-hidden="true" />}</span>
          </div>
        </Fragment>)}
      </div>,
      // Stay inside aria-modal while escaping the scrolling form body.
      triggerRef.current?.closest('[role="dialog"]') ?? document.body,
    )}
    {!compact && failed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{t.accountsFailed}</p>}
    {!compact && accounts.length === 0 && <p className="settings-row__hint">{t.accountsEmpty}</p>}
  </div>;
}
