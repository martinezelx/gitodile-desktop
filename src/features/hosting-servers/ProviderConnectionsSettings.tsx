import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Globe, Info, KeyRound, LoaderCircle, Plus, Server } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { HostingProviderIcon, RefreshIconButton, ToolInstallationRow } from "../../shared/ui";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import {
  accountsPort, TokenConnectionRows, TokenEntryForm, useAccounts,
  type AccountCatalog, type AccountsPort, type HostingKind, type HostingProvider, type TokenConnectionPort,
} from "../accounts";
import { GitHubAccountSection, githubTokenPort, useGitHubAuth, useGitHubTokenCopy, type GitHubAuthController } from "../github";
import { GitLabAccountSection, gitlabTokenPort, useGitLabAuth, useGitLabTokenCopy, type GitLabAuthController } from "../gitlab";
import type { HostingServersPort } from "./port";
import { hostingServersPort } from "./tauriAdapter";

export type BuiltInAuth = { kind: "github"; controller: GitHubAuthController } | { kind: "gitlab"; controller: GitLabAuthController };
type ConnectRequest = { provider: string; nonce: number } | null;

/** Settings → GitHub/GitLab connections: one account list for every host of
 * the product, one way to add an account, and the company-server inventory.
 * Every network action is explicit; opening the section reads cached state. */
export function ProviderConnectionsSettings({ auth, cliAvailable, port = hostingServersPort, accountPort = accountsPort, tokenPort }: {
  auth: BuiltInAuth; cliAvailable: boolean | null; port?: HostingServersPort; accountPort?: AccountsPort;
  /** github.com/gitlab.com token port; defaults to the product's adapter. */
  tokenPort?: TokenConnectionPort;
}): React.JSX.Element {
  const { t } = useLanguage();
  const kind = auth.kind;
  const builtInTokenPort = tokenPort ?? (kind === "github" ? githubTokenPort : gitlabTokenPort);
  const headingId = useId();
  const { catalog, loaded, failed, reload, check, pending: checking } = useAccounts(accountPort, true);
  const providers = catalog.providers.filter(provider => provider.kind === kind);
  const builtIn: HostingProvider = providers.find(provider => provider.builtIn) ?? { id: kind, host: `${kind}.com`, kind, builtIn: true };
  const servers = providers.filter(provider => !provider.builtIn);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [connectRequest, setConnectRequest] = useState<ConnectRequest>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const hasAccounts = catalog.accounts.some(account => providers.some(provider => provider.id === account.provider));
  // The add button is disabled while its panel is open; focus it once enabled.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!adding && restoreFocus.current) { restoreFocus.current = false; addButton.current?.focus(); }
  }, [adding]);
  const close = (): void => { restoreFocus.current = true; setAdding(false); };
  const checkAll = (): void => {
    void check(kind);
    void auth.controller.check();
    setCheckNonce(value => value + 1);
  };
  const connect = (provider: string): void => {
    setAdding(false);
    if (provider === builtIn.id) void auth.controller.connect();
    else setConnectRequest(previous => ({ provider, nonce: (previous?.nonce ?? 0) + 1 }));
  };

  return <>
    <section className="settings-group" aria-labelledby={headingId}>
      <header className="settings-group__header hosting-accounts__header">
        <div><h3 id={headingId}>{t.hostingAccountsTitle}</h3><p>{t.hostingAccountsDescription}</p></div>
        <div className="github-account__actions">
          <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={checking || catalog.busy}
            disabled={failed || adding} onClick={checkAll} />
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
        {adding && <AddAccountPanel kind={kind} hosts={[builtIn, ...servers]} cliAvailable={cliAvailable} port={port} builtInTokenPort={builtInTokenPort}
          catalog={catalog}
          onCancel={close} onConnect={connect} onSettled={reload}
          onAdded={text => { restoreFocus.current = true; setAdding(false); setMessage(text); reload(); }} />}
        <HostAccounts provider={builtIn} catalog={catalog} loaded={loaded} checking={checking} onChanged={reload}
          tokenPort={builtInTokenPort}>
          {auth.kind === "github"
            ? <GitHubAccountSection controller={auth.controller} available={cliAvailable} />
            : <GitLabAccountSection controller={auth.controller} available={cliAvailable} host={builtIn.host} />}
        </HostAccounts>
        {servers.map(server => <ServerAccounts key={server.id} server={server} catalog={catalog} loaded={loaded} checking={checking} port={port}
          onChanged={reload} cliAvailable={cliAvailable} connectRequest={connectRequest} checkNonce={checkNonce} />)}
        {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
      </div>
    </section>
    <CompanyServersGroup kind={kind} servers={servers} catalog={catalog} failed={failed} reload={reload} port={port} />
  </>;
}

function HostAccounts({ provider, catalog, loaded, checking, tokenPort, onChanged, children }: {
  provider: HostingProvider; catalog: AccountCatalog; loaded: boolean; checking: boolean; tokenPort: TokenConnectionPort;
  onChanged: () => void; children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useLanguage();
  const githubCopy = useGitHubTokenCopy(provider.builtIn ? undefined : provider);
  const gitlabCopy = useGitLabTokenCopy(provider.builtIn ? undefined : provider);
  const empty = !catalog.accounts.some(account => account.provider === provider.id);
  return <div className="hosting-accounts__host" role="group" aria-label={provider.host}>
    <p className="hosting-accounts__host-label">
      {provider.builtIn ? <HostingProviderIcon provider={provider.kind} /> : <Server aria-hidden="true" />}
      <strong>{provider.host}</strong>
      {!provider.builtIn && <span className="hosting-accounts__pill">{t.hostingAccountsCompany}</span>}
    </p>
    <div className="hosting-accounts__list">
      <TokenConnectionRows provider={provider.id} catalog={catalog} checking={checking} port={tokenPort}
        copy={provider.kind === "github" ? githubCopy : gitlabCopy} onChanged={onChanged} />
      {children}
      {empty && loaded && <p className="github-account__note hosting-accounts__empty">{t.hostingAccountsNone}</p>}
    </div>
  </div>;
}

function ServerAccounts({ server, catalog, loaded, checking, port, onChanged, cliAvailable, connectRequest, checkNonce }: {
  server: HostingProvider; catalog: AccountCatalog; loaded: boolean; checking: boolean; port: HostingServersPort; onChanged: () => void;
  cliAvailable: boolean | null; connectRequest: ConnectRequest; checkNonce: number;
}): React.JSX.Element {
  const tokenPort = useMemo(() => port.tokenPort(server.id), [port, server.id]);
  return <HostAccounts provider={server} catalog={catalog} loaded={loaded} checking={checking} tokenPort={tokenPort} onChanged={onChanged}>
    {server.kind === "github"
      ? <GitHubServerBrowser server={server} port={port} cliAvailable={cliAvailable} connectRequest={connectRequest} checkNonce={checkNonce} />
      : <GitLabServerBrowser server={server} port={port} cliAvailable={cliAvailable} connectRequest={connectRequest} checkNonce={checkNonce} />}
  </HostAccounts>;
}

/** Runs a connect or check that the shared list asked this host to start. */
function useHostRequests(provider: string, connectRequest: ConnectRequest, checkNonce: number,
  controller: { connect: () => Promise<void>; check: () => Promise<void> }): void {
  const lastConnect = useRef(connectRequest?.nonce ?? 0);
  const lastCheck = useRef(checkNonce);
  const latest = useRef(controller);
  latest.current = controller;
  useEffect(() => {
    if (connectRequest && connectRequest.provider === provider && connectRequest.nonce !== lastConnect.current) {
      lastConnect.current = connectRequest.nonce;
      void latest.current.connect();
    }
  }, [connectRequest, provider]);
  useEffect(() => {
    if (checkNonce !== lastCheck.current) { lastCheck.current = checkNonce; void latest.current.check(); }
  }, [checkNonce]);
}

function GitHubServerBrowser({ server, port, cliAvailable, connectRequest, checkNonce }: {
  server: HostingProvider; port: HostingServersPort; cliAvailable: boolean | null; connectRequest: ConnectRequest; checkNonce: number;
}): React.JSX.Element {
  const authPort = useMemo(() => port.githubAuthPort(server.id, server.host), [port, server.id, server.host]);
  const controller = useGitHubAuth(authPort, true);
  useHostRequests(server.id, connectRequest, checkNonce, controller);
  return <GitHubAccountSection controller={controller} available={cliAvailable} allowSwitch={false} />;
}

function GitLabServerBrowser({ server, port, cliAvailable, connectRequest, checkNonce }: {
  server: HostingProvider; port: HostingServersPort; cliAvailable: boolean | null; connectRequest: ConnectRequest; checkNonce: number;
}): React.JSX.Element | null {
  const authPort = useMemo(() => port.gitlabAuthPort(server.id), [port, server.id]);
  const controller = useGitLabAuth(authPort, true);
  useHostRequests(server.id, connectRequest, checkNonce, controller);
  return <GitLabAccountSection controller={controller} available={cliAvailable} host={server.host} />;
}

/** One way to add an account: method, host, then the token field or the
 * browser consent. Consequences are stated here, before the action. */
function AddAccountPanel({ kind, hosts, cliAvailable, port, builtInTokenPort, catalog, onCancel, onConnect, onAdded, onSettled }: {
  kind: HostingKind; hosts: HostingProvider[]; cliAvailable: boolean | null; port: HostingServersPort; builtInTokenPort: TokenConnectionPort;
  catalog: AccountCatalog;
  onCancel: () => void; onConnect: (provider: string) => void; onAdded: (message: string) => void; onSettled: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [method, setMethod] = useState<"token" | "browser">("token");
  const [provider, setProvider] = useState(hosts[0].id);
  const host = hosts.find(item => item.id === provider) ?? hosts[0];
  const github = useGitHubTokenCopy(host.builtIn ? undefined : host);
  const gitlab = useGitLabTokenCopy(host.builtIn ? undefined : host);
  const tokenPort = useMemo(() => host.builtIn ? builtInTokenPort : port.tokenPort(host.id), [host.builtIn, host.id, builtInTokenPort, port]);
  const continueRef = useRef<HTMLButtonElement>(null);
  const tool = kind === "github" ? "GitHub CLI (gh)" : "GitLab CLI (glab)";
  // glab holds one session per host; a second needs the first signed out.
  const session = kind === "gitlab" ? catalog.accounts.find(account => account.id.startsWith(`${host.id}:cli.`)) : undefined;
  useEffect(() => { if (method === "browser") continueRef.current?.focus(); }, [method]);
  return <div className="github-account__authorization hosting-accounts__add" role="group" aria-label={t.hostingAccountsAdd}
    onKeyDownCapture={event => { if (event.key === "Escape" && method === "browser") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <div className="hosting-accounts__choices">
      <div className="hosting-accounts__segmented" role="radiogroup" aria-label={t.hostingAccountsMethod}>
        <button type="button" role="radio" aria-checked={method === "token"} onClick={() => setMethod("token")}><KeyRound aria-hidden="true" />{t.accountsTokenMethod}</button>
        <button type="button" role="radio" aria-checked={method === "browser"} onClick={() => setMethod("browser")}><Globe aria-hidden="true" />{t.accountsBrowserMethod}</button>
      </div>
      {hosts.length > 1 && <div className="hosting-accounts__segmented" role="radiogroup" aria-label={t.hostingAccountsHost}>
        {hosts.map(item => <button key={item.id} type="button" role="radio" aria-checked={item.id === provider} onClick={() => setProvider(item.id)}>
          {item.builtIn ? <HostingProviderIcon provider={item.kind} /> : <Server aria-hidden="true" />}{item.host}</button>)}
      </div>}
    </div>
    {method === "token"
      ? <TokenEntryForm key={provider} provider={provider} port={tokenPort} copy={kind === "github" ? github : gitlab}
        onDone={onAdded} onCancel={onCancel} onSettled={onSettled} />
      : <>
        <p>{kind === "github" ? t.githubAuthShared : t.gitlabAuthShared}</p>
        <p>{kind === "github" ? t.githubAuthPermissions : t.gitlabAuthPermissions}</p>
        <p>{kind === "github" ? t.githubAuthStorageConsent : t.gitlabAuthStorageConsent}</p>
        {cliAvailable === false && <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{t.hostingAccountsCliMissing.replace("{tool}", tool)}</span></p>}
        {session && <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{t.hostingAccountsOneSession.replace("{login}", session.login)}</span></p>}
        <div className="github-account__actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{t.commonCancel}</button>
          <button ref={continueRef} type="button" className="primary-button" disabled={cliAvailable !== true || session !== undefined} onClick={() => onConnect(provider)}>
            {kind === "github" ? t.githubAuthConfirm : t.gitlabAuthConfirm}</button>
        </div>
      </>}
  </div>;
}

/** Company servers of one product: an inventory. Their accounts live in the
 * account list above; adding one contacts only the address the user typed. */
function CompanyServersGroup({ kind, servers, catalog, failed, reload, port }: {
  kind: HostingKind; servers: HostingProvider[]; catalog: AccountCatalog; failed: boolean; reload: () => void; port: HostingServersPort;
}): React.JSX.Element {
  const { t } = useLanguage();
  const headingId = useId();
  const addressId = useId();
  const helpId = useId();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const request = useRef<string | null>(null);
  const mounted = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const dismissRemove = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const title = kind === "github" ? t.hostingServersGitHubTitle : t.hostingServersGitLabTitle;
  useInstallDraftBlocker(`${kind}-servers`, title, pending || (editing && address.length > 0));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (request.current) void port.cancel(request.current).catch(() => undefined);
    };
  }, [port]);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  useEffect(() => { if (removing) dismissRemove.current?.focus(); }, [removing]);

  const add = async (): Promise<void> => {
    if (pending || !address.trim()) return;
    const requestId = `server_${crypto.randomUUID().replaceAll("-", "")}`;
    request.current = requestId;
    setPending(true); setError(null); setMessage("");
    try {
      await port.add(kind, address.trim(), requestId);
      if (mounted.current) { restoreFocus.current = true; setEditing(false); setAddress(""); setMessage(t.hostingServersAdded); }
    } catch (failure) { if (mounted.current) setError(failure); }
    finally {
      request.current = null;
      if (mounted.current) { setPending(false); reload(); }
    }
  };
  const remove = async (provider: string): Promise<void> => {
    if (pending) return;
    setPending(true); setError(null); setMessage("");
    try {
      await port.remove(provider);
      if (mounted.current) { setRemoving(null); setMessage(t.hostingServersRemoved); addButton.current?.focus(); }
    } catch (failure) { if (mounted.current) setError(failure); }
    finally { if (mounted.current) { setPending(false); reload(); } }
  };
  const cancelEditing = (): void => {
    if (request.current) void port.cancel(request.current).catch(() => undefined);
    restoreFocus.current = true;
    setEditing(false); setAddress(""); setError(null);
  };
  // The add button returns with the closed form; give focus back to it then.
  useEffect(() => {
    if (restoreFocus.current && !editing) { restoreFocus.current = false; addButton.current?.focus(); }
  }, [editing]);
  const errorCopy = isAppError(error) && error.code === "stale_preview" ? t.hostingServersExists
    : localizeAppError(error, t, t.hostingServersFailed);
  const removingServer = servers.find(server => server.id === removing);
  const accountCount = (id: string): string => {
    const count = catalog.accounts.filter(account => account.provider === id).length;
    return (count === 1 ? t.hostingServersAccountsOne : t.hostingServersAccountsMany).replace("{count}", String(count));
  };

  return <section className="settings-group" aria-labelledby={headingId}>
    <header className="settings-group__header hosting-accounts__header">
      <div><h3 id={headingId}>{title}</h3><p>{kind === "github" ? t.hostingServersGitHubDescription : t.hostingServersGitLabDescription}</p></div>
      {!editing && <button ref={addButton} type="button" className="secondary-button"
        disabled={failed || pending || removing !== null || servers.length >= 8}
        onClick={() => { setEditing(true); setError(null); setMessage(""); }}>
        <Plus aria-hidden="true" />{t.hostingServersAdd}</button>}
    </header>
    <div className="settings-group__body github-account" onKeyDownCapture={event => {
      if (event.key !== "Escape" || (!editing && !removing)) return;
      event.preventDefault(); event.stopPropagation();
      if (removing && !pending) setRemoving(null);
      else if (editing) cancelEditing();
    }}>
      {servers.length > 0 && <div className="hosting-accounts__list">
        {servers.map(server => <div key={server.id} role="group" aria-label={`${title}: ${server.host}`}>
          <ToolInstallationRow mark={<Server aria-hidden="true" />} name={server.host}
            chip={{ label: accountCount(server.id), tone: "neutral" }} status={null}
            primaryAction={<button type="button" className="secondary-button" disabled={pending || editing || removing !== null}
              aria-label={`${t.hostingServersRemove} · ${server.host}`}
              onClick={() => { setRemoving(server.id); setError(null); setMessage(""); }}>{t.accountsRemove}</button>} />
        </div>)}
      </div>}
      {servers.length === 0 && !editing && <p className="github-account__note">{t.hostingServersEmpty}</p>}
      {removingServer && <div className="github-account__authorization" role="group" aria-label={t.hostingServersRemoveTitle.replace("{host}", removingServer.host)}>
        <strong>{t.hostingServersRemoveTitle.replace("{host}", removingServer.host)}</strong>
        <p>{t.hostingServersRemoveConsent}</p>
        <div className="github-account__actions">
          <button ref={dismissRemove} type="button" className="secondary-button" disabled={pending} onClick={() => setRemoving(null)}>{t.commonCancel}</button>
          <button type="button" className="danger-button" disabled={pending} onClick={() => void remove(removingServer.id)}>
            {pending && <LoaderCircle className="icon--spinning" aria-hidden="true" />}{t.hostingServersRemove}</button>
        </div>
      </div>}
      {editing && <form className="github-account__authorization github-token__editor" onSubmit={event => { event.preventDefault(); void add(); }}>
        <label className="text-field" htmlFor={addressId}><span>{t.hostingServersAddress}</span>
          <input ref={input} id={addressId} type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={300}
            placeholder="https://git.example.com" required disabled={pending} value={address}
            aria-describedby={helpId} onChange={event => setAddress(event.target.value)} />
        </label>
        <small id={helpId} className="github-account__note">{t.hostingServersAddressHelp} {t.hostingServersLimit}</small>
        <p className="github-account__shared"><Info aria-hidden="true" /><span>{t.hostingServersAddConsent}</span></p>
        <p className="github-account__shared"><Info aria-hidden="true" /><span>{t.hostingServersTrust}</span></p>
        <div className="github-account__actions">
          <button type="button" className="secondary-button" onClick={cancelEditing}>{t.commonCancel}</button>
          <button type="submit" className="primary-button" disabled={pending || !address.trim()}>
            {pending && <LoaderCircle className="icon--spinning" aria-hidden="true" />}{pending ? t.hostingServersChecking : t.hostingServersCheckAndAdd}</button>
        </div>
      </form>}
      {error != null && <p role="alert" className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{errorCopy}</span></p>}
      {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
    </div>
  </section>;
}
