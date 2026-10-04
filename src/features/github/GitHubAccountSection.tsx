import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Info, LoaderCircle, LogOut, Plus, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { copyTextToClipboard, RefreshIconButton, ToolInstallationRow, type ToolChip } from "../../shared/ui";
import { githubAccountChip, githubAccountRows, isGitHubAuthBusy, isGitHubAvatarDataUrl, type GitHubSavedAccount } from "./domain";
import type { GitHubAuthController } from "./useGitHubAuth";

function AccountAvatar({ source }: { source: string | null }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  return !failed && isGitHubAvatarDataUrl(source)
    ? <img className="github-account__avatar" src={source} alt="" onError={() => setFailed(true)} />
    : <UserRound className="github-account__avatar" aria-hidden="true" />;
}

/** An eager Settings body. Account rows share the installation-row geometry. */
export function GitHubAccountSection({ controller, available }: {
  controller: GitHubAuthController;
  available: boolean | null;
}): React.JSX.Element {
  const { t } = useLanguage();
  const { snapshot, pending, browserFailed } = controller;
  const [confirming, setConfirming] = useState(false);
  const [logoutLogin, setLogoutLogin] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const containerRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const logoutDismissRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasConfirming = useRef(false);
  const busy = pending || isGitHubAuthBusy(snapshot.state);
  const accounts = githubAccountRows(snapshot);
  const logoutTarget = accounts.find(account => account.login === logoutLogin);
  const hasLogoutTarget = Boolean(logoutTarget);
  const blocked = snapshot.state === "cli_unsupported" || snapshot.state === "environment_controlled"
    || snapshot.account?.storage === "environment";
  const mutationDisabled = !available || busy || blocked || snapshot.needsCheck;

  useEffect(() => {
    if (logoutLogin !== null && !hasLogoutTarget) setLogoutLogin(null);
  }, [logoutLogin, hasLogoutTarget]);
  useEffect(() => {
    if (confirming) continueRef.current?.focus();
    else if (logoutLogin !== null) logoutDismissRef.current?.focus();
    else if (wasConfirming.current && !busy) {
      if (triggerRef.current?.isConnected && !triggerRef.current.disabled) triggerRef.current.focus();
      else containerRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
    if (!busy) wasConfirming.current = confirming || logoutLogin !== null;
  }, [confirming, logoutLogin, busy]);

  const showLogin = (event: React.MouseEvent<HTMLButtonElement>): void => {
    triggerRef.current = event.currentTarget;
    setLogoutLogin(null); setConfirming(true);
  };
  const showLogout = (event: React.MouseEvent<HTMLButtonElement>, login: string): void => {
    triggerRef.current = event.currentTarget;
    setConfirming(false); setLogoutLogin(login);
  };
  const copy = async (): Promise<void> => {
    setCopyState(await copyTextToClipboard(snapshot.deviceCode ?? "") ? "copied" : "failed");
  };
  const check = (): void => { setConfirming(false); setLogoutLogin(null); void controller.check(); };
  const checking = snapshot.state === "checking" || pending;
  const recheck = <RefreshIconButton className="tool-row__recheck"
    label={snapshot.state === "unchecked" ? t.githubAuthDetect : t.githubAuthCheck}
    busyLabel={t.githubAuthStatus.checking} busy={checking} disabled={!available || busy} onClick={check} />;
  const cancel = busy && snapshot.operationId
    ? <button type="button" className="secondary-button" disabled={pending || snapshot.state === "cancelling"} onClick={() => void controller.cancel()}>{t.githubAuthCancel}</button>
    : null;
  const status = snapshot.state === "connected" || snapshot.state === "signed_out" || snapshot.state === "unchecked"
    ? <span className="visually-hidden">{t.githubAuthStatus[snapshot.state]}</span>
    : <p className={`status-line status-line--${busy ? "progress" : "warning"}`}>
      {busy ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <span>{t.githubAuthStatus[snapshot.state]}</span>
    </p>;

  const row = (account: GitHubSavedAccount | null): React.JSX.Element => {
    const active = !account || account.active;
    const state = githubAccountChip(snapshot, account, available, busy);
    const chip: ToolChip = { label: t.githubAuthChip[state], tone: state === "connected" ? "success" : state === "invalid" ? "danger"
      : state === "unchecked" && snapshot.state !== "unchecked" ? "warning" : "neutral",
      icon: state === "connected" ? <CheckCircle2 aria-hidden="true" /> : state === "checking" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : undefined };
    const signOut = account && <button type="button"
      className={active && snapshot.state === "connected" ? "secondary-button" : "secondary-button refresh-icon-button"}
      disabled={mutationDisabled || account.storage === "environment" || logoutLogin !== null}
      aria-label={active && snapshot.state === "connected" ? undefined : t.githubAuthLogoutConfirm.replace("{login}", account.login)}
      data-tooltip={active && snapshot.state === "connected" ? undefined : t.githubAuthLogoutConfirm.replace("{login}", account.login)}
      onClick={event => showLogout(event, account.login)}>
      <LogOut aria-hidden="true" />{active && snapshot.state === "connected" ? t.githubAuthDisconnect : null}
    </button>;
    const primary = active ? cancel ?? (snapshot.state === "connected" && account ? signOut : <>
      {signOut}<button type="button" className="primary-button" disabled={!available || busy || blocked || confirming} onClick={showLogin}>
        {snapshot.state === "invalid" ? t.githubAuthReconnect : t.githubAuthConnect}
      </button>
    </>) : <button type="button" className="secondary-button"
      aria-label={t.githubAuthUseAccountLabel.replace("{login}", account!.login)}
      disabled={mutationDisabled || account!.storage === "environment" || confirming || logoutLogin !== null}
      onClick={event => { triggerRef.current = event.currentTarget; wasConfirming.current = true; void controller.activate(account!.login); }}>{t.githubAuthUseAccount}</button>;
    return <div className="github-account__row" key={account?.login ?? "empty"} role="group" aria-label={account ? `@${account.login}` : t.githubAuthAccountName}>
      <ToolInstallationRow
        mark={<AccountAvatar key={account?.avatarDataUrl ?? account?.login ?? "empty"} source={account?.avatarDataUrl ?? null} />}
        name={account ? `@${account.login}` : t.githubAuthAccountName}
        chip={chip}
        detail={account ? <span className="github-account__host">{account.host}</span> : <span className="github-account__note">{available === false ? t.githubAuthMissing : t.githubAuthNetwork}</span>}
        status={active ? status : account?.state === "invalid" || account?.state === "offline" ? <p className="status-line status-line--warning">{t.githubAuthStatus[account.state]}</p> : null}
        hint={account?.storage === "file" ? <><CircleAlert aria-hidden="true" /><span className="github-account__warning">{t.githubAuthFile}</span></>
          : account?.storage === "environment" ? <><Info aria-hidden="true" /><span>{t.githubAuthEnvironment}</span></>
            : account?.storage === "unknown" ? <><Info aria-hidden="true" /><span>{t.githubAuthUnknownStorage}</span></> : null}
        recheck={active ? recheck : signOut}
        primaryAction={primary}
      />
    </div>;
  };

  return <div ref={containerRef} className="github-account" onKeyDownCapture={event => {
    // An inline confirmation consumes Escape before the outer Settings dialog.
    if (event.key === "Escape" && (confirming || logoutLogin !== null)) {
      event.preventDefault(); event.stopPropagation(); setConfirming(false); setLogoutLogin(null);
    }
  }}>
    {!accounts.some(account => account.active) && row(null)}
    {accounts.map(row)}
    {accounts.length > 0 && <div className="github-account__footer">
      <p className="github-account__note">{t.githubAuthSelectedPurpose}</p>
      <button type="button" className="secondary-button" disabled={!available || busy || blocked || confirming || logoutLogin !== null} onClick={showLogin}>
        <Plus aria-hidden="true" />{t.githubAuthConnectAnother}
      </button>
    </div>}
    {accounts.length > 0 && <p className="github-account__shared"><Info aria-hidden="true" /><span>{t.githubAuthShared}</span></p>}
    {snapshot.needsCheck && <p className="github-account__note">{t.githubAuthNeedsCheck}</p>}
    {snapshot.signedOutAccount && <p className="github-account__note" role="status">{t.githubAuthLogoutDone.replace("{login}", snapshot.signedOutAccount)}</p>}
    {snapshot.state === "awaiting_browser" && snapshot.deviceCode && <div className="github-account__authorization">
      <p>{t.githubAuthDeviceSteps}</p>
      <code className="github-account__code">{snapshot.deviceCode}</code>
      <div className="github-account__actions">
        <button type="button" className="secondary-button" onClick={() => void copy()}>{copyState === "copied" ? t.githubAuthCopied : t.githubAuthCopyCode}</button>
        <button type="button" className="secondary-button" onClick={() => void controller.openBrowser()}>{t.githubAuthOpenBrowser}<ExternalLink aria-hidden="true" /></button>
      </div>
      {copyState === "failed" && <p role="status">{t.githubAuthCopyFailed}</p>}
      {browserFailed && <p role="alert">{t.githubAuthBrowserFailed}</p>}
    </div>}
    {confirming && !busy && <div className="github-account__authorization">
      <p>{t.githubAuthShared}</p><p>{t.githubAuthPermissions}</p><p>{t.githubAuthStorageConsent}</p>
      <div className="github-account__actions">
        <button ref={continueRef} type="button" className="primary-button" onClick={() => { setConfirming(false); setCopyState("idle"); void controller.connect(); }}>{t.githubAuthConfirm}</button>
        <button type="button" className="secondary-button" onClick={() => setConfirming(false)}>{t.githubAuthNotNow}</button>
      </div>
    </div>}
    {logoutLogin && hasLogoutTarget && !busy && <div className="github-account__authorization">
      <p>{t.githubAuthLogoutConsent.replace("{login}", logoutLogin)}</p>
      <p>{t.githubAuthLogoutBrowser}</p>
      <div className="github-account__actions">
        <button type="button" className="danger-button" disabled={mutationDisabled || logoutTarget?.storage === "environment"} onClick={() => {
          const login = logoutLogin; setLogoutLogin(null); void controller.disconnect(login);
        }}>{t.githubAuthLogoutConfirm.replace("{login}", logoutLogin)}</button>
        <button ref={logoutDismissRef} type="button" className="secondary-button" onClick={() => setLogoutLogin(null)}>{t.githubAuthNotNow}</button>
      </div>
    </div>}
  </div>;
}
