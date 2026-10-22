import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useLanguage } from "../../i18n";
import { HostingProviderIcon, RefreshIconButton } from "../../shared/ui";
import { AccountPicker } from "./AccountPicker";
import { providerForSource, remoteAccountIssues, type AccountCatalog, type AccountProject, type HostingProvider, type RemoteAccountIssue } from "./domain";
import type { AccountsPort } from "./port";
import { accountsPort } from "./tauriAdapter";
import { useAccounts } from "./useAccounts";

/** One row per host the project's HTTPS remotes use. `signInRemoteUrls` are
 * redacted addresses whose stored value carries sign-in details; Git would use
 * those, so the native guard refuses them and the row says so briefly (the
 * remote itself carries the full explanation). */
export function ProjectAccountSection({ project, remoteUrls, signInRemoteUrls = [], port = accountsPort }: {
  project: AccountProject; remoteUrls: readonly string[]; signInRemoteUrls?: readonly string[]; port?: AccountsPort;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const headingId = useId();
  const { catalog, pending, failed, check, reload } = useAccounts(port, remoteUrls.length > 0);
  const [readRevision, setReadRevision] = useState(0);
  const issues = remoteAccountIssues(remoteUrls, signInRemoteUrls, catalog.providers);
  const usedProviders = new Set(remoteUrls.map(url => providerForSource(url, catalog.providers)));
  const providers = catalog.providers.filter(provider => usedProviders.has(provider.id) || issues.has(provider.id));
  if (remoteUrls.length === 0 || (catalog.providers.length > 0 && providers.length === 0)) return null;
  const checkAll = async (): Promise<void> => {
    for (const provider of providers) await check(provider.id);
    setReadRevision(value => value + 1);
  };
  const noAccounts = providers.length > 0 && !catalog.accounts.some(account => providers.some(provider => provider.id === account.provider));
  return <section className="settings-group" aria-labelledby={headingId}>
    <header className="settings-group__header hosting-access__header">
      <div>
        <h3 id={headingId}>{t.accountsProjectTitle}</h3>
        <p>{t.accountsProjectDescription}</p>
      </div>
      {providers.length > 0 && <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={pending || catalog.busy}
        onClick={() => void checkAll()} />}
    </header>
    <div className="settings-group__body">
      {providers.length > 0 && <div className="hosting-access">
        {providers.map(provider => <ProviderAccount key={`${provider.id}:${project.path}:${project.sessionEpoch}`}
          project={project} port={port} provider={provider} catalog={catalog} pending={pending} issue={issues.get(provider.id)?.issue}
          readRevision={readRevision} onCheck={() => void check(provider.id)} />)}
      </div>}
      {noAccounts && <p className="settings-row__hint">{t.accountsEmpty}</p>}
      {failed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{catalog.providers.length === 0 ? t.accountsCatalogFailed : t.accountsFailed}</p>}
      {catalog.providers.length === 0 && !failed && <p className="settings-row__hint">{t.accountsLoading}</p>}
      {catalog.providers.length === 0 && failed && <RefreshIconButton label={t.settingsGeneralCheckAgain} busyLabel={t.accountsLoading} busy={false} onClick={reload} />}
    </div>
  </section>;
}

function ProviderAccount({ project, port, provider, catalog, pending, issue, readRevision, onCheck }: {
  project: AccountProject; port: AccountsPort; provider: HostingProvider; catalog: AccountCatalog;
  pending: boolean; issue?: RemoteAccountIssue; readRevision: number; onCheck: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [selection, setSelection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true); setWriteFailed(false); setSaved(false);
    void port.readProject(project, provider.id).then(next => {
      if (request === generation.current) { setSelection(next.accountId); setLoading(false); }
    }).catch(() => { if (request === generation.current) { setWriteFailed(true); setLoading(false); } });
    return () => { generation.current += 1; };
  }, [project.path, project.sessionEpoch, provider.id, port, readRevision]);
  const choose = async (accountId: string | null): Promise<void> => {
    if (inFlight.current || loading) return;
    inFlight.current = true; setSaving(true); setWriteFailed(false); setSaved(false);
    const request = generation.current;
    try {
      const next = await port.selectProject(project, provider.id, accountId, selection);
      if (request === generation.current) { setSelection(next.accountId); setSaved(true); }
    } catch {
      if (request === generation.current) {
        setWriteFailed(true);
        try { const next = await port.readProject(project, provider.id); if (request === generation.current) setSelection(next.accountId); }
        catch { /* Keep the last known identity and require a fresh read. */ }
      }
    }
    finally { inFlight.current = false; if (request === generation.current) setSaving(false); }
  };
  return <div className="hosting-access__row" role="group" aria-label={provider.host}>
    <span className="hosting-access__host"><HostingProviderIcon provider={provider.kind} /><span>{provider.host}</span></span>
    <AccountPicker catalog={catalog} provider={provider.id} value={selection} onChange={value => void choose(value)}
      onCheck={onCheck} disabled={loading || saving || pending} compact />
    {(issue || writeFailed || saved) && <div className="hosting-access__status">
      {issue && <p className="settings-row__hint settings-row__hint--warning" role="note">
        <CircleAlert aria-hidden="true" />{issue === "sign-in" ? t.accountsRemoteSignIn : t.accountsRemoteInsecure}</p>}
      {writeFailed && <p role="alert" className="settings-row__hint settings-row__hint--danger">{t.accountsFailed}</p>}
      {saved && <p className="settings-row__hint settings-row__hint--success" role="status">{t.accountsSaved}</p>}
    </div>}
  </div>;
}
