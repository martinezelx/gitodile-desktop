import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../i18n";
import { AccountRow } from "../accounts";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import type { GitLabAuthController } from "./useGitLabAuth";

/** One host's glab account inside the shared account list, which owns the
 * heading, the account check and the way to connect. glab keeps one session
 * per host: its row, a progress line while it works, the inline sign-out
 * confirmation and any failure. */
export function GitLabAccountSection({ controller, available, host = "gitlab.com" }: {
  controller: GitLabAuthController; available: boolean | null; host?: string;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const { snapshot, pending } = controller;
  const [confirming, setConfirming] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  const account = snapshot.account;
  const busy = pending || snapshot.operationId !== null;
  useInstallDraftBlocker(`gitlab-browser:${host}`, t.gitlabAuthAccountName, busy || confirming);
  useEffect(() => {
    if (confirming) confirm.current?.focus();
    else if (restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); }
  }, [confirming]);
  const verified = snapshot.state === "connected" && !snapshot.needsCheck;
  const failure = ["failed", "invalid", "offline", "timed_out", "cli_unsupported", "environment_controlled"].includes(snapshot.state);
  const dismiss = (): void => { restoreFocus.current = true; setConfirming(false); };
  if (!account && !busy && !failure && !snapshot.needsCheck) return null;
  return <div className="github-account github-account--embedded" onKeyDownCapture={event => {
    if (event.key === "Escape" && confirming) { event.preventDefault(); event.stopPropagation(); if (!busy) dismiss(); }
  }}>
    {account && <AccountRow login={account.login} method="browser"
      state={{ label: busy ? t.gitlabAuthChip.checking : verified ? t.gitlabAuthChip.connected : t.gitlabAuthChip.unchecked,
        tone: verified && !busy ? "success" : "neutral",
        icon: busy ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : verified ? <CheckCircle2 aria-hidden="true" /> : undefined }}
      notice={snapshot.needsCheck ? <p role="status" className="github-account__note">{t.gitlabAuthNeedsCheck}</p> : null}
      actions={<button type="button" className="secondary-button" disabled={busy || !verified || available !== true || confirming}
        onClick={event => { trigger.current = event.currentTarget; setConfirming(true); }}>{t.gitlabAuthDisconnect}</button>} />}
    {!account && snapshot.needsCheck && !busy && <p role="status" className="github-account__note">{t.gitlabAuthNeedsCheck}</p>}
    {busy && <div className="github-account__actions github-account__pending">
      <p role="status" className="status-line status-line--progress"><LoaderCircle className="icon--spinning" aria-hidden="true" /><span>{t.gitlabAuthStatus[snapshot.state]}</span></p>
      {snapshot.operationId && <button type="button" className="secondary-button" disabled={pending || snapshot.state === "cancelling"}
        onClick={() => void controller.cancel()}>{t.gitlabAuthCancel}</button>}
    </div>}
    {confirming && account && <div className="github-account__authorization" role="group" aria-label={t.gitlabAuthDisconnect}>
      <p>{t.gitlabAuthLogoutConsent.replaceAll("{login}", account.login)}</p>
      <p>{t.gitlabAuthLogoutBrowser}</p>
      <div className="github-account__actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={dismiss}>{t.commonCancel}</button>
        <button ref={confirm} type="button" className="danger-button" disabled={busy}
          onClick={() => { setConfirming(false); void controller.disconnect(account.id); }}>{t.gitlabAuthDisconnect}</button>
      </div>
    </div>}
    {failure && <p className="status-line status-line--warning" role="alert"><CircleAlert aria-hidden="true" /><span>{t.gitlabAuthStatus[snapshot.state]}</span></p>}
  </div>;
}
