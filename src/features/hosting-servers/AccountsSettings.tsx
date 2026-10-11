import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, CircleAlert, CircleArrowUp, Globe, Info, KeyRound, LoaderCircle, Plus, Server, TriangleAlert } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import {
  handlePopupMenuKeyDown, HostingProviderIcon, RefreshIconButton, ToolInstallationRow, useAnchoredPopup,
} from "../../shared/ui";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import {
  accountsPort, TokenConnectionRows, TokenEntryForm, useAccounts,
  type AccountCatalog, type AccountsPort, type HostingKind, type HostingProvider, type TokenConnectionPort,
} from "../accounts";
import { bitbucketTokenPort, useBitbucketTokenCopy } from "../bitbucket";
import { GitHubAccountSection, githubTokenPort, useGitHubAuth, useGitHubTokenCopy, type GitHubAuthController } from "../github";
import { GitLabAccountSection, gitlabTokenPort, useGitLabAuth, useGitLabTokenCopy, type GitLabAuthController } from "../gitlab";
import type { HostingServersPort } from "./port";
import { hostingServersPort } from "./tauriAdapter";

type ConnectRequest = { provider: string; nonce: number } | null;
/** A product's CLI as Settings renders it: its name, the full group for that
 * product's block, the bare row for the connect panel that needs it, and
 * whether it asks for a look (an update, or a CLI that does not answer). */
export type ProviderTooling = {
  name: string; section: React.ReactNode; inline: React.ReactNode; attention: "update" | "problem" | null;
};
export type AccountsTooling = { github?: ProviderTooling | null; gitlab?: ProviderTooling | null };

const KINDS: readonly HostingKind[] = ["github", "gitlab", "bitbucket"];
const PROVIDER_NAMES: Record<HostingKind, string> = { github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };
const PUBLIC_HOSTS: Record<HostingKind, string> = { github: "github.com", gitlab: "gitlab.com", bitbucket: "bitbucket.org" };
const CLI_NAMES: Record<"github" | "gitlab", string> = { github: "GitHub CLI", gitlab: "GitLab CLI" };
const CLI_COMMANDS: Record<"github" | "gitlab", string> = { github: "gh", gitlab: "glab" };

/** Settings → Accounts: every connected account in one list grouped by host,
 * one way to connect another for any provider, and a folded block per provider
 * for what only that provider has — company servers and its CLI. Every network
 * action is explicit; opening the section reads cached state. */
export function AccountsSettings({
  github, gitlab, tooling = {}, openMenu = false, onMenuOpened,
  port = hostingServersPort, accountPort = accountsPort, tokenPorts = {},
}: {
  github: { controller: GitHubAuthController; cliAvailable: boolean | null };
  gitlab: { controller: GitLabAuthController; cliAvailable: boolean | null };
  tooling?: AccountsTooling;
  /** Opens the provider menu once, on arrival: Home's "connect another account". */
  openMenu?: boolean;
  onMenuOpened?: () => void;
  port?: HostingServersPort; accountPort?: AccountsPort;
  /** Public-host token ports; each defaults to the product's adapter. */
  tokenPorts?: Partial<Record<HostingKind, TokenConnectionPort>>;
}): React.JSX.Element {
  const { t } = useLanguage();
  const headingId = useId();
  const providersId = useId();
  const accounts = useAccounts(accountPort, true);
  const { catalog, loaded, failed, reload, check, pending: checking } = accounts;
  const [adding, setAdding] = useState<HostingKind | null>(null);
  const [menuOpen, setMenuOpen] = useState(openMenu);
  const [message, setMessage] = useState("");
  const [connectRequest, setConnectRequest] = useState<ConnectRequest>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const attention = (kind: HostingKind): ProviderTooling["attention"] => (kind === "bitbucket" ? null : tooling[kind]?.attention ?? null);
  const ghAttention = attention("github");
  const glAttention = attention("gitlab");
  const [open, setOpen] = useState<Record<HostingKind, boolean>>(
    () => ({ github: ghAttention !== null, gitlab: glAttention !== null, bitbucket: false }));
  /* A block that asks for a look opens by itself, on arrival or when the
     answer arrives later, unless the reader has folded or opened it already.
     It never folds by itself: an update finishing must not move the page. */
  const touched = useRef<Record<HostingKind, boolean>>({ github: false, gitlab: false, bitbucket: false });
  useEffect(() => {
    const due = (["github", "gitlab"] as const).filter(kind =>
      (kind === "github" ? ghAttention : glAttention) !== null && !touched.current[kind]);
    if (due.length === 0) return;
    setOpen(previous => due.every(kind => previous[kind]) ? previous
      : { ...previous, ...Object.fromEntries(due.map(kind => [kind, true])) });
  }, [ghAttention, glAttention]);
  const trigger = useRef<HTMLButtonElement>(null);
  const builtInPorts: Record<HostingKind, TokenConnectionPort> = {
    github: tokenPorts.github ?? githubTokenPort,
    gitlab: tokenPorts.gitlab ?? gitlabTokenPort,
    bitbucket: tokenPorts.bitbucket ?? bitbucketTokenPort,
  };
  const builtIn = (kind: HostingKind): HostingProvider =>
    catalog.providers.find(provider => provider.kind === kind && provider.builtIn) ?? { id: kind, host: PUBLIC_HOSTS[kind], kind, builtIn: true };
  const servers = (kind: HostingKind): HostingProvider[] => catalog.providers.filter(provider => provider.kind === kind && !provider.builtIn);
  const accountCount = (kind: HostingKind): number =>
    catalog.accounts.filter(account => catalog.providers.some(provider => provider.id === account.provider && provider.kind === kind)
      || account.provider === kind).length;
  const hasAccounts = catalog.accounts.length > 0;
  const toolName = (kind: "github" | "gitlab"): string => tooling[kind]?.name ?? CLI_NAMES[kind];

  useEffect(() => { if (openMenu) onMenuOpened?.(); }, [openMenu, onMenuOpened]);
  // The trigger is disabled while a panel is open; focus it once enabled.
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (adding === null && restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); }
  }, [adding]);
  const closeMenu = (focusTrigger: boolean): void => { setMenuOpen(false); if (focusTrigger) trigger.current?.focus(); };
  const { containerRef, popupRef } = useAnchoredPopup(menuOpen, trigger, closeMenu, "selected-menu-item");
  const choose = (kind: HostingKind): void => { setMenuOpen(false); setAdding(kind); setMessage(""); };
  const close = (): void => { restoreFocus.current = true; setAdding(null); };
  const added = (text: string): void => { restoreFocus.current = true; setAdding(null); setMessage(text); reload(); };
  const checkAll = (): void => {
    const kinds = KINDS.filter(kind => catalog.providers.some(provider => provider.kind === kind));
    void check(kinds.length > 0 ? kinds : KINDS);
    void github.controller.check();
    void gitlab.controller.check();
    setCheckNonce(value => value + 1);
  };
  const connect = (kind: "github" | "gitlab", provider: string): void => {
    setAdding(null);
    if (provider === builtIn(kind).id) void (kind === "github" ? github.controller.connect() : gitlab.controller.connect());
    else setConnectRequest(previous => ({ provider, nonce: (previous?.nonce ?? 0) + 1 }));
  };
  const summary = (kind: HostingKind): string => {
    const count = accountCount(kind);
    const parts = [(count === 1 ? t.hostingServersAccountsOne : t.hostingServersAccountsMany).replace("{count}", String(count))];
    if (kind === "bitbucket") return [...parts, t.accountsSettingsTokenOnly].join(" · ");
    const serverCount = servers(kind).length;
    if (serverCount > 0) parts.push((serverCount === 1 ? t.accountsSettingsServersOne : t.accountsSettingsServersMany).replace("{count}", String(serverCount)));
    const cli = kind === "github" ? github.cliAvailable : gitlab.cliAvailable;
    // With a chip saying what the CLI needs, the summary does not repeat it.
    if (cli !== null && attention(kind) === null) {
      parts.push((cli ? t.accountsSettingsCliReady : t.accountsSettingsCliMissing).replace("{tool}", toolName(kind)));
    }
    return parts.join(" · ");
  };
  const toggle = (kind: HostingKind): void => {
    touched.current[kind] = true;
    setOpen(previous => ({ ...previous, [kind]: !previous[kind] }));
  };

  return <>
    <section className="settings-group" aria-labelledby={headingId}>
      <header className="settings-group__header hosting-accounts__header">
        <div><h3 id={headingId}>{t.accountsSettingsConnectedTitle}</h3><p>{t.hostingAccountsDescription}</p></div>
        <div className="github-account__actions">
          <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={checking || catalog.busy}
            disabled={failed || adding !== null} onClick={checkAll} />
          <div ref={containerRef} className="accounts-connect" onKeyDownCapture={event => {
            // The menu takes Escape before the Settings dialog does.
            if (event.key === "Escape" && menuOpen) { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
          }}>
            <button ref={trigger} type="button" className={hasAccounts || !loaded ? "secondary-button" : "primary-button"}
              aria-haspopup="menu" aria-expanded={menuOpen} disabled={failed || adding !== null}
              onClick={() => setMenuOpen(value => !value)}>
              <Plus aria-hidden="true" />{t.accountsSettingsConnect}</button>
            {menuOpen && <div ref={popupRef} className="app-menu accounts-connect__menu" role="menu" aria-label={t.accountsSettingsChooseProvider}
              tabIndex={-1} onKeyDown={event => handlePopupMenuKeyDown(event, popupRef.current, () => closeMenu(true))}>
              {KINDS.map(kind => <button key={kind} type="button" role="menuitem" className="app-menu__item accounts-connect__item"
                onClick={() => choose(kind)}>
                <HostingProviderIcon provider={kind} />
                {/* The space keeps the accessible name from running the two together. */}
                <span><strong>{PROVIDER_NAMES[kind]}</strong>{" "}
                  <small>{kind === "bitbucket" ? t.accountsSettingsMenuToken : t.accountsSettingsMenuBrowserOrToken}</small></span>
              </button>)}
            </div>}
          </div>
        </div>
      </header>
      <div className="settings-group__body hosting-accounts">
        {failed && <div role="alert" className="status-line status-line--warning">
          <CircleAlert aria-hidden="true" /><span>{t.accountsCatalogFailed}</span>
          <button type="button" className="secondary-button" onClick={reload}>{t.accountsRetryRead}</button>
        </div>}
        {(adding === "github" || adding === "gitlab") && <AddAccountPanel kind={adding} hosts={[builtIn(adding), ...servers(adding)]}
          cliAvailable={adding === "github" ? github.cliAvailable : gitlab.cliAvailable} port={port} builtInTokenPort={builtInPorts[adding]}
          catalog={catalog} onCancel={close} onConnect={provider => connect(adding, provider)} onSettled={reload} onAdded={added}
          tool={CLI_COMMANDS[adding]} toolRow={tooling[adding]?.inline} />}
        {adding === "bitbucket" && <BitbucketAddPanel provider={builtIn("bitbucket")} port={builtInPorts.bitbucket}
          onCancel={close} onSettled={reload} onAdded={added} />}
        {loaded && !hasAccounts && <p className="github-account__note hosting-accounts__empty">{t.hostingAccountsNone}</p>}
        <HostAccounts provider={builtIn("github")} catalog={catalog} checking={checking} onChanged={reload} tokenPort={builtInPorts.github}>
          <GitHubAccountSection controller={github.controller} available={github.cliAvailable} />
        </HostAccounts>
        {servers("github").map(server => <ServerAccounts key={server.id} server={server} catalog={catalog} checking={checking} port={port}
          onChanged={reload} cliAvailable={github.cliAvailable} connectRequest={connectRequest} checkNonce={checkNonce} />)}
        <HostAccounts provider={builtIn("gitlab")} catalog={catalog} checking={checking} onChanged={reload} tokenPort={builtInPorts.gitlab}>
          <GitLabAccountSection controller={gitlab.controller} available={gitlab.cliAvailable} host={builtIn("gitlab").host} />
        </HostAccounts>
        {servers("gitlab").map(server => <ServerAccounts key={server.id} server={server} catalog={catalog} checking={checking} port={port}
          onChanged={reload} cliAvailable={gitlab.cliAvailable} connectRequest={connectRequest} checkNonce={checkNonce} />)}
        <HostAccounts provider={builtIn("bitbucket")} catalog={catalog} checking={checking} onChanged={reload} tokenPort={builtInPorts.bitbucket} />
        {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
      </div>
    </section>
    <section className="settings-group" aria-labelledby={providersId}>
      <header className="settings-group__header">
        <h3 id={providersId}>{t.accountsSettingsProvidersTitle}</h3><p>{t.accountsSettingsProvidersDescription}</p>
      </header>
      <div className="settings-group__body accounts-providers">
        {KINDS.map(kind => <ProviderBlock key={kind} kind={kind} summary={summary(kind)} open={open[kind]} onToggle={() => toggle(kind)}
          attention={attention(kind)} tool={kind === "bitbucket" ? "" : toolName(kind)}>
          {kind === "bitbucket"
            ? <div className="accounts-provider__note"><p>{t.bitbucketAccountsDescription}</p><p>{t.bitbucketTokenPermissions}</p></div>
            : <>
              <CompanyServersGroup kind={kind} servers={servers(kind)} catalog={catalog} failed={failed} reload={reload} port={port} />
              {tooling[kind]?.section}
            </>}
        </ProviderBlock>)}
      </div>
    </section>
  </>;
}

/** One provider's folded block. Its content mounts on first opening and then
 * stays mounted while folded, so a half-typed server address survives. */
function ProviderBlock({ kind, summary, attention, tool, open, onToggle, children }: {
  kind: HostingKind; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode;
  /** What the provider's CLI asks for, said on the folded block itself. */
  attention: ProviderTooling["attention"]; tool: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const bodyId = useId();
  const [opened, setOpened] = useState(open);
  useEffect(() => { if (open) setOpened(true); }, [open]);
  return <div className="accounts-provider" role="group" aria-label={PROVIDER_NAMES[kind]}>
    <button type="button" className="accounts-provider__head" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
      <span className="accounts-provider__mark" aria-hidden="true"><HostingProviderIcon provider={kind} /></span>
      <span className="accounts-provider__text"><strong>{PROVIDER_NAMES[kind]}</strong>{" "}<span>{summary}</span></span>
      {attention && " "}
      {attention && <span className={`tool-row__chip tool-row__chip--${attention === "update" ? "accent" : "warning"} accounts-provider__chip`}>
        {attention === "update" ? <CircleArrowUp aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
        <span>{(attention === "update" ? t.accountsSettingsCliUpdate : t.accountsSettingsCliProblem).replace("{tool}", tool)}</span>
      </span>}
      <ChevronDown className="accounts-provider__chevron" aria-hidden="true" />
    </button>
    <div id={bodyId} className="accounts-provider__body" hidden={!open}>{(open || opened) && children}</div>
  </div>;
}

/** One host's connections in the shared list. A host with nothing to show
 * folds away (CSS), so the list holds only what is connected or in progress. */
function HostAccounts({ provider, catalog, checking, tokenPort, onChanged, children }: {
  provider: HostingProvider; catalog: AccountCatalog; checking: boolean; tokenPort: TokenConnectionPort;
  onChanged: () => void; children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useLanguage();
  const githubCopy = useGitHubTokenCopy(provider.builtIn ? undefined : provider);
  const gitlabCopy = useGitLabTokenCopy(provider.builtIn ? undefined : provider);
  const bitbucketCopy = useBitbucketTokenCopy();
  const copy = provider.kind === "github" ? githubCopy : provider.kind === "gitlab" ? gitlabCopy : bitbucketCopy;
  return <div className="hosting-accounts__host" role="group" aria-label={provider.host}>
    <p className="hosting-accounts__host-label">
      {provider.builtIn ? <HostingProviderIcon provider={provider.kind} /> : <Server aria-hidden="true" />}
      <strong>{provider.host}</strong>
      {!provider.builtIn && <span className="hosting-accounts__pill">{t.hostingAccountsCompany}</span>}
    </p>
    <div className="hosting-accounts__list">
      <TokenConnectionRows provider={provider.id} catalog={catalog} checking={checking} port={tokenPort} copy={copy} onChanged={onChanged} />
      {children}
    </div>
  </div>;
}

function ServerAccounts({ server, catalog, checking, port, onChanged, cliAvailable, connectRequest, checkNonce }: {
  server: HostingProvider; catalog: AccountCatalog; checking: boolean; port: HostingServersPort; onChanged: () => void;
  cliAvailable: boolean | null; connectRequest: ConnectRequest; checkNonce: number;
}): React.JSX.Element {
  const tokenPort = useMemo(() => port.tokenPort(server.id), [port, server.id]);
  return <HostAccounts provider={server} catalog={catalog} checking={checking} tokenPort={tokenPort} onChanged={onChanged}>
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

/** One way to add a GitHub or GitLab account: method, host, then the token
 * field or the browser consent. Consequences are stated here, before the action. */
function AddAccountPanel({ kind, hosts, cliAvailable, port, builtInTokenPort, catalog, onCancel, onConnect, onAdded, onSettled, tool, toolRow }: {
  kind: "github" | "gitlab"; hosts: HostingProvider[]; cliAvailable: boolean | null; port: HostingServersPort; builtInTokenPort: TokenConnectionPort;
  catalog: AccountCatalog;
  /** The CLI's command for the notice, and its own row: the browser method
   * offers to install or repair it right here instead of pointing elsewhere. */
  tool: string; toolRow?: React.ReactNode;
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
  const title = t.accountsSettingsAddTitle.replace("{provider}", PROVIDER_NAMES[kind]);
  // glab holds one session per host; a second needs the first signed out.
  const session = kind === "gitlab" ? catalog.accounts.find(account => account.id.startsWith(`${host.id}:cli.`)) : undefined;
  useEffect(() => { if (method === "browser") continueRef.current?.focus(); }, [method]);
  return <div className="github-account__authorization hosting-accounts__add" role="group" aria-label={title}
    onKeyDownCapture={event => { if (event.key === "Escape" && method === "browser") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}>
    <strong className="hosting-accounts__add-title"><HostingProviderIcon provider={kind} />{title}</strong>
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
        {cliAvailable === false && toolRow}
        {session && <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{t.hostingAccountsOneSession.replace("{login}", session.login)}</span></p>}
        <div className="github-account__actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{t.commonCancel}</button>
          <button ref={continueRef} type="button" className="primary-button" disabled={cliAvailable !== true || session !== undefined} onClick={() => onConnect(provider)}>
            {kind === "github" ? t.githubAuthConfirm : t.gitlabAuthConfirm}</button>
        </div>
      </>}
  </div>;
}

/** Bitbucket connects with an API token only: no method or host to choose. */
function BitbucketAddPanel({ provider, port, onCancel, onAdded, onSettled }: {
  provider: HostingProvider; port: TokenConnectionPort; onCancel: () => void; onAdded: (message: string) => void; onSettled: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const copy = useBitbucketTokenCopy();
  const title = t.accountsSettingsAddTitle.replace("{provider}", PROVIDER_NAMES.bitbucket);
  return <div className="github-account__authorization hosting-accounts__add" role="group" aria-label={title}>
    <strong className="hosting-accounts__add-title"><HostingProviderIcon provider="bitbucket" />{title}</strong>
    <TokenEntryForm provider={provider.id} port={port} copy={copy} onCancel={onCancel} onSettled={onSettled} onDone={onAdded} />
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
