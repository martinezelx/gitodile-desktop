import { useId } from "react";
import { useLanguage } from "../../i18n";
import { RefreshIconButton } from "../../shared/ui";
import type { AccountCatalog } from "./domain";
/** Acquisition and project preferences share this provider-neutral control. */
export function AccountPicker({ catalog, provider, value, onChange, onCheck, disabled = false, failed = false }: {
  catalog: AccountCatalog; provider: string; value: string | null;
  onChange: (accountId: string | null) => void; onCheck: () => void;
  disabled?: boolean; failed?: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const id = useId();
  const accounts = catalog.accounts.filter(account => account.provider === provider);
  const missing = value !== null && !accounts.some(account => account.id === value);
  return <div className="hosting-account-picker">
    <label className="text-field" htmlFor={id}>
      <span>{t.accountsProjectLabel}</span>
      <select id={id} value={value ?? ""} disabled={disabled || catalog.busy} aria-describedby={`${id}-help`}
        onChange={event => onChange(event.target.value || null)}>
        <option value="">{t.accountsUseGit}</option>
        {missing && <option value={value} disabled>{t.accountsUnavailable.replace("{account}", value)}</option>}
        {accounts.map(account => <option key={account.id} value={account.id} disabled={!account.available}>
          @{account.login} · {account.host}{!account.available ? ` · ${t.accountsNeedsCheck}` : ""}
        </option>)}
      </select>
      <small id={`${id}-help`}>{t.accountsProjectHelp}</small>
    </label>
    <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={catalog.busy}
      disabled={disabled || catalog.busy} onClick={onCheck} />
    {failed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{t.accountsFailed}</p>}
    {accounts.length === 0 && <p className="settings-row__hint">{t.accountsEmpty}</p>}
  </div>;
}
