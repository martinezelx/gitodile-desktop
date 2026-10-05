import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../i18n";
import { RefreshIconButton } from "../../shared/ui";
import type { AccountCatalog } from "./domain";
/** Acquisition and project preferences share this provider-neutral control. */
export function AccountPicker({ catalog, provider, value, onChange, onCheck, disabled = false, failed = false, required = false, label, showHelp = true }: {
  catalog: AccountCatalog; provider: string; value: string | null;
  onChange: (accountId: string | null) => void; onCheck: () => void;
  disabled?: boolean; failed?: boolean;
  required?: boolean;
  label?: string;
  showHelp?: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const id = useId();
  const accounts = catalog.accounts.filter(account => account.provider === provider);
  const missing = value !== null && !accounts.some(account => account.id === value);
  return <div className="hosting-account-picker">
    <label className="text-field" htmlFor={id}>
      <span>{label ?? t.accountsProjectLabel}</span>
      <span className="hosting-account-picker__select">
        <select id={id} value={value ?? ""} disabled={disabled || catalog.busy} aria-describedby={showHelp ? `${id}-help` : undefined}
          onChange={event => onChange(event.target.value || null)}>
          <option value="">{required ? t.accountsChoose : t.accountsUseGit}</option>
          {missing && <option value={value} disabled>{t.accountsUnavailable.replace("{account}", value)}</option>}
          {accounts.map(account => <option key={account.id} value={account.id} disabled={!account.available}>
            @{account.login} · {account.host} · {account.id.startsWith("github:token.") ? t.accountsTokenMethod : t.accountsBrowserMethod}{!account.available ? ` · ${t.accountsNeedsCheck}` : ""}
          </option>)}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
      {showHelp && <small id={`${id}-help`}>{t.accountsProjectHelp}</small>}
    </label>
    <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={catalog.busy}
      disabled={disabled || catalog.busy} onClick={onCheck} />
    {failed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{t.accountsFailed}</p>}
    {accounts.length === 0 && <p className="settings-row__hint">{t.accountsEmpty}</p>}
  </div>;
}
