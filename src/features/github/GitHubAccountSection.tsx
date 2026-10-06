import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Info, LoaderCircle, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { AccountRow } from "../accounts";
import { copyTextToClipboard, type ToolChip } from "../../shared/ui";
import { githubAccountChip, githubAccountRows, isGitHubAuthBusy, isGitHubAvatarDataUrl, type GitHubSavedAccount } from "./domain";
import type { GitHubAuthController } from "./useGitHubAuth";

function AccountAvatar({ source }: { source: string | null }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  return !failed && isGitHubAvatarDataUrl(source)
    ? <img className="github-account__avatar" src={source} alt="" onError={() => setFailed(true)} />
    : <UserRound className="github-account__avatar" aria-hidden="true" />;
}

/** One host's gh accounts inside the shared account list, which owns the
 * heading, the account check and the way to add an account. Each saved
 * account is one row; the panels below it hold what an action needs: the
 * device code while authorizing, and the inline sign-out and reconnect
 * confirmations. `allowSwitch` offers changing gh's active account. */
export function GitHubAccountSection({ controller, available, allowSwitch = true }: {
  controller: GitHubAuthController;
  available: boolean | null;
  allowSwitch?: boolean;
}): React.JSX.Element | null {
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
  const cancel = busy && snapshot.operationId
    ? <button type="button" className="secondary-button" disabled={pending || snapshot.state === "cancelling"} onClick={() => void controller.cancel()}>{t.githubAuthCancel}</button>
    : null;
  // The chip already names a settled state; the line speaks for anything else.
  const settled = ["connected", "signed_out", "unchecked"].includes(snapshot.state);
  const status = settled ? null : <p className={`status-line status-line--${busy ? "progress" : "warning"}`}>
    {busy ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
    <span>{t.githubAuthStatus[snapshot.state]}</span>
  </p>;

  const row = (account: GitHubSavedAccount): React.JSX.Element => {
    const state = githubAccountChip(snapshot, account, available, busy);
    const chip: ToolChip = { label: t.githubAuthChip[state], tone: state === "connected" ? "success" : state === "invalid" ? "danger"
      : state === "unchecked" && snapshot.state !== "unchecked" ? "warning" : "neutral",
      icon: state === "connected" ? <CheckCircle2 aria-hidden="true" /> : state === "checking" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : undefined };
    const signOut = <button type="button" className="secondary-button"
      disabled={mutationDisabled || account.storage === "environment" || logoutLogin !== null}
      aria-label={t.githubAuthLogoutConfirm.replace("{login}", account.login)}
      onClick={event => showLogout(event, account.login)}>{t.githubAuthDisconnect}</button>;
    const actions = account.active ? cancel ?? <>
      {snapshot.state === "invalid" && <button type="button" className="secondary-button"
        disabled={!available || busy || blocked || confirming} onClick={showLogin}>{t.githubAuthReconnect}</button>}
      {signOut}
    </> : <>
      {allowSwitch && <button type="button" className="secondary-button"
        aria-label={t.githubAuthUseAccountLabel.replace("{login}", account.login)}
        disabled={mutationDisabled || account.storage === "environment" || confirming || logoutLogin !== null}
        onClick={event => { triggerRef.current = event.currentTarget; wasConfirming.current = true; void controller.activate(account.login); }}>{t.githubAuthUseAccount}</button>}
      {signOut}
    </>;
    const problem = account.active ? status
      : account.state === "invalid" || account.state === "offline"
        ? <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{t.githubAuthStatus[account.state]}</span></p> : null;
    const storage = account.storage === "file" ? <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{t.githubAuthFile}</span></p>
      : account.storage === "environment" ? <p className="status-line"><Info aria-hidden="true" /><span>{t.githubAuthEnvironment}</span></p>
        : account.storage === "unknown" ? <p className="status-line"><Info aria-hidden="true" /><span>{t.githubAuthUnknownStorage}</span></p> : null;
    return <AccountRow key={account.login} login={account.login} method="browser" state={chip}
      avatar={isGitHubAvatarDataUrl(account.avatarDataUrl) ? <AccountAvatar key={account.avatarDataUrl} source={account.avatarDataUrl} /> : undefined}
      notice={problem || storage ? <>{problem}{storage}</> : null} actions={actions} />;
  };

  if (accounts.length === 0 && settled && !busy && !snapshot.needsCheck && !snapshot.signedOutAccount && !confirming) return null;
  return <div ref={containerRef} className="github-account github-account--embedded" onKeyDownCapture={event => {
    // An inline confirmation consumes Escape before the outer Settings dialog.
    if (event.key === "Escape" && (confirming || logoutLogin !== null)) {
      event.preventDefault(); event.stopPropagation(); setConfirming(false); setLogoutLogin(null);
    }
  }}>
    {accounts.length === 0 && (status || cancel) && <div className="github-account__actions github-account__pending">{status}{cancel}</div>}
    {accounts.map(row)}
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
        <button type="button" className="secondary-button" onClick={() => setConfirming(false)}>{t.githubAuthNotNow}</button>
        <button ref={continueRef} type="button" className="primary-button" onClick={() => { setConfirming(false); setCopyState("idle"); void controller.connect(); }}>{t.githubAuthConfirm}</button>
      </div>
    </div>}
    {logoutLogin && hasLogoutTarget && !busy && <div className="github-account__authorization">
      <p>{t.githubAuthLogoutConsent.replace("{login}", logoutLogin)}</p>
      <p>{t.githubAuthLogoutBrowser}</p>
      <div className="github-account__actions">
        <button ref={logoutDismissRef} type="button" className="secondary-button" onClick={() => setLogoutLogin(null)}>{t.githubAuthNotNow}</button>
        <button type="button" className="danger-button" disabled={mutationDisabled || logoutTarget?.storage === "environment"} onClick={() => {
          const login = logoutLogin; setLogoutLogin(null); void controller.disconnect(login);
        }}>{t.githubAuthLogoutConfirm.replace("{login}", logoutLogin)}</button>
      </div>
    </div>}
  </div>;
}
