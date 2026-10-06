import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Plus } from "lucide-react";
import { useLanguage } from "../../i18n";
import { HostingProviderIcon, RefreshIconButton } from "../../shared/ui";
import {
  accountsPort, TokenConnectionRows, TokenEntryForm, useAccounts,
  type AccountsPort, type HostingProvider, type TokenConnectionCopy, type TokenConnectionPort,
} from "../accounts";
import { bitbucketTokenPort } from "./tauriAdapter";

const BITBUCKET: HostingProvider = { id: "bitbucket", host: "bitbucket.org", kind: "bitbucket", builtIn: true };

export function useBitbucketTokenCopy(): TokenConnectionCopy {
  const { t } = useLanguage();
  return {
    connect: t.bitbucketTokenConnect,
    connected: t.bitbucketTokenConnected,
    exists: t.bitbucketTokenExists,
    label: t.bitbucketTokenLabel,
    limit: t.bitbucketTokenLimit,
    limitReached: t.bitbucketTokenLimitReached,
    permissions: t.bitbucketTokenPermissions,
    permissionsTitle: t.bitbucketTokenPermissionsTitle,
    removalConsent: t.bitbucketTokenRemovalConsent,
    removalTitle: t.bitbucketTokenRemovalTitle,
    remove: t.bitbucketTokenRemove,
    removed: t.bitbucketTokenRemoved,
    storage: t.bitbucketTokenStorage,
    title: t.bitbucketTokenTitle,
    failed: t.bitbucketTokenFailed, checking: t.bitbucketTokenChecking, chips: t.bitbucketTokenChip,
    permissionDenied: t.bitbucketTokenPermissionDenied,
  };
}

/** Settings → Bitbucket: API-token connections for bitbucket.org. There is no
 * browser connection or company server; opening the section reads cached
 * state and every network action is explicit. */
export function BitbucketConnectionsSettings({ accountPort = accountsPort, tokenPort = bitbucketTokenPort }: {
  accountPort?: AccountsPort; tokenPort?: TokenConnectionPort;
}): React.JSX.Element {
  const { t } = useLanguage();
  const copy = useBitbucketTokenCopy();
  const headingId = useId();
  const { catalog, loaded, failed, reload, check, pending: checking } = useAccounts(accountPort, true);
  const provider = catalog.providers.find(item => item.kind === "bitbucket") ?? BITBUCKET;
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const hasAccounts = catalog.accounts.some(account => account.provider === provider.id);
  // The add button is disabled while its form is open; focus it once enabled.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!adding && restoreFocus.current) { restoreFocus.current = false; addButton.current?.focus(); }
  }, [adding]);
  const close = (): void => { restoreFocus.current = true; setAdding(false); };

  return <section className="settings-group" aria-labelledby={headingId}>
    <header className="settings-group__header hosting-accounts__header">
      <div><h3 id={headingId}>{t.hostingAccountsTitle}</h3><p>{t.bitbucketAccountsDescription}</p></div>
      <div className="github-account__actions">
        <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={checking || catalog.busy}
          disabled={failed || adding} onClick={() => void check(provider.kind)} />
        <button ref={addButton} type="button" className={hasAccounts || !loaded ? "secondary-button" : "primary-button"}
          disabled={failed || adding} onClick={() => { setAdding(true); setMessage(""); }}>
          <Plus aria-hidden="true" />{t.hostingAccountsAdd}</button>
      </div>
    </header>
    <div className="settings-group__body hosting-accounts">
      {failed && <div role="alert" className="status-line status-line--warning">
        <CircleAlert aria-hidden="true" /><span>{t.accountsCatalogFailed}</span>
        <button type="button" className="secondary-button" onClick={reload}>{t.accountsRetryRead}</button>
      </div>}
      {adding && <div className="github-account__authorization hosting-accounts__add" role="group" aria-label={t.hostingAccountsAdd}>
        <TokenEntryForm provider={provider.id} port={tokenPort} copy={copy} onCancel={close} onSettled={reload}
          onDone={text => { close(); setMessage(text); reload(); }} />
      </div>}
      <div className="hosting-accounts__host" role="group" aria-label={provider.host}>
        <p className="hosting-accounts__host-label"><HostingProviderIcon provider="bitbucket" /><strong>{provider.host}</strong></p>
        <div className="hosting-accounts__list">
          <TokenConnectionRows provider={provider.id} catalog={catalog} checking={checking} port={tokenPort} copy={copy} onChanged={reload} />
          {!hasAccounts && loaded && <p className="github-account__note hosting-accounts__empty">{t.hostingAccountsNone}</p>}
        </div>
      </div>
      {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
    </div>
  </section>;
}
