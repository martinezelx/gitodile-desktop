import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n";
import { RefreshIconButton } from "../../shared/ui";
import { AccountPicker } from "./AccountPicker";
import type { AccountCatalog, AccountProject } from "./domain";
import type { AccountsPort } from "./port";
import { accountsPort } from "./tauriAdapter";
import { useAccounts } from "./useAccounts";
export function ProjectAccountSection({ project, port = accountsPort }: { project: AccountProject; port?: AccountsPort }): React.JSX.Element {
  const { t } = useLanguage();
  const { catalog, pending, failed, check, reload } = useAccounts(port, true);
  return <section className="settings-group">
    <header className="settings-group__header"><h3>{t.accountsProjectTitle}</h3><p>{t.accountsProjectDescription}</p></header>
    <div className="settings-group__body">
      {catalog.providers.map(provider => <ProviderAccount key={`${provider.id}:${project.path}:${project.sessionEpoch}`}
        project={project} port={port} provider={provider.id} catalog={catalog} pending={pending} failed={failed} check={check} />)}
      {catalog.providers.length === 0 && <p className="settings-row__hint">{failed ? t.accountsFailed : t.accountsLoading}</p>}
      {catalog.providers.length === 0 && failed && <RefreshIconButton label={t.settingsGeneralCheckAgain} busyLabel={t.accountsLoading} busy={false} onClick={reload} />}
    </div>
  </section>;
}

function ProviderAccount({ project, port, provider, catalog, pending, failed, check }: {
  project: AccountProject; port: AccountsPort; provider: string; catalog: AccountCatalog;
  pending: boolean; failed: boolean; check: (provider: string) => Promise<void>;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [selection, setSelection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const [readRevision, setReadRevision] = useState(0);
  useEffect(() => {
    const request = ++generation.current;
    if (!provider) return;
    setLoading(true); setWriteFailed(false); setSaved(false);
    void port.readProject(project, provider).then(next => {
      if (request === generation.current) { setSelection(next.accountId); setLoading(false); }
    }).catch(() => { if (request === generation.current) { setWriteFailed(true); setLoading(false); } });
    return () => { generation.current += 1; };
  }, [project.path, project.sessionEpoch, provider, port, readRevision]);
  const choose = async (accountId: string | null): Promise<void> => {
    if (!provider || inFlight.current || loading) return;
    inFlight.current = true; setSaving(true); setWriteFailed(false); setSaved(false);
    const request = generation.current;
    try {
      const next = await port.selectProject(project, provider, accountId, selection);
      if (request === generation.current) { setSelection(next.accountId); setSaved(true); }
    } catch {
      if (request === generation.current) {
        setWriteFailed(true);
        try { const next = await port.readProject(project, provider); if (request === generation.current) setSelection(next.accountId); }
        catch { /* Keep the last known identity and require a fresh read. */ }
      }
    }
    finally { inFlight.current = false; if (request === generation.current) setSaving(false); }
  };
  return <div>
      <AccountPicker catalog={catalog} provider={provider} value={selection} onChange={value => void choose(value)}
        onCheck={() => { void check(provider); setReadRevision(value => value + 1); }} disabled={loading || saving || pending} failed={failed || writeFailed} />
      {saved && <p className="settings-row__hint settings-row__hint--success" role="status">{t.accountsSaved}</p>}
  </div>;
}
