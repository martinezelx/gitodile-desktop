import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import { HostingProviderIcon } from "../../shared/ui";
import { TokenConnectionRows, TokenEntryForm, type TokenConnectionCopy, type AccountCatalog, type HostingProvider } from "../accounts";
import type { AzureConnectionsPort } from "./port";

export function useAzureTokenCopy(): TokenConnectionCopy {
  const { t } = useLanguage();
  return { connect: t.azureConnect, connected: t.azureConnected, exists: t.azureExists,
    label: t.azureToken, limit: t.azureLimit, limitReached: t.azureLimitReached,
    permissions: t.azurePermissions, permissionsTitle: t.azurePermissionsTitle,
    removalConsent: t.azureRemovalConsent, removalTitle: t.azureRemovalTitle,
    remove: t.azureRemove, removed: t.azureRemoved, storage: t.azureStorage,
    title: t.azureTitle, failed: t.azureFailed, checking: t.azureChecking,
    chips: t.azureChips };
}
export function AzureAddPanel({ port, onCancel, onAdded, onSettled }: {
  port: AzureConnectionsPort; onCancel: () => void; onAdded: (message: string) => void; onSettled: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const copy = useAzureTokenCopy();
  const [address, setAddress] = useState("");
  const [org, setOrg] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useInstallDraftBlocker("azure-organization", t.azureTitle, Boolean(address));
  const tokenPort = useMemo(() => port.tokenPort(org ?? ""), [port, org]);
  const next = (): void => {
    const value = address.trim().replace(/^https:\/\/dev\.azure\.com\//, "").replace(/\/+$/, "").toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value)) { setInvalid(true); return; }
    setOrg(value); setInvalid(false);
  };
  return <div className="github-account__authorization hosting-accounts__add" role="group" aria-label={t.azureTitle}
    onKeyDownCapture={event => { if (event.key === "Escape" && !org) { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <strong className="hosting-accounts__add-title"><HostingProviderIcon provider="azure" />{t.azureTitle}</strong>
    {!org ? <form className="github-token__editor" onSubmit={event => { event.preventDefault(); next(); }}>
      <label className="text-field"><span>{t.azureOrganization}</span><input ref={input} value={address} maxLength={100} required autoComplete="off" spellCheck={false}
        placeholder="https://dev.azure.com/contoso" aria-invalid={invalid || undefined} aria-describedby="azure-organization-help"
        onChange={event => { setAddress(event.target.value); setInvalid(false); }} /></label>
      <p id="azure-organization-help" className="github-account__note">{t.azureOrganizationHelp}</p>
      {invalid && <p role="alert" className="status-line status-line--warning">{t.azureOrganizationInvalid}</p>}
      <div className="github-account__actions"><button type="button" className="secondary-button" onClick={onCancel}>{t.commonCancel}</button>
        <button type="submit" className="primary-button" disabled={!address.trim()}>{t.azureContinue}</button></div>
    </form> : <><p>dev.azure.com/{org}</p><TokenEntryForm provider={`azure-${org}`} port={tokenPort} copy={copy} onCancel={onCancel} onSettled={onSettled} onDone={onAdded} /></>}
  </div>;
}
export function AzureConnectionRows({ provider, catalog, checking, port, onChanged }: {
  provider: HostingProvider; catalog: AccountCatalog; checking: boolean; port: AzureConnectionsPort; onChanged: () => void;
}): React.JSX.Element {
  const copy = useAzureTokenCopy();
  const tokenPort = useMemo(() => port.tokenPort(provider.scopePath ?? ""), [port, provider.scopePath]);
  return <div className="hosting-accounts__host" role="group" aria-label={`dev.azure.com/${provider.scopePath}`}>
    <p className="hosting-accounts__host-label"><HostingProviderIcon provider="azure" /><strong>dev.azure.com/{provider.scopePath}</strong></p>
    <div className="hosting-accounts__list"><TokenConnectionRows provider={provider.id} catalog={catalog} checking={checking} port={tokenPort} copy={copy} onChanged={onChanged} /></div>
  </div>;
}
