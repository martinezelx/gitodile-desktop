import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, LogOut, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { RefreshIconButton, ToolInstallationRow } from "../../shared/ui";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import type { GitLabAuthController } from "./useGitLabAuth";
export function GitLabAccountSection({ controller, available }: { controller: GitLabAuthController; available: boolean | null }): React.JSX.Element {
  const { t } = useLanguage();
  const { snapshot, pending } = controller;
  const [consent, setConsent] = useState<"connect" | "disconnect" | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const account = snapshot.account;
  const busy = pending || snapshot.operationId !== null;
  useInstallDraftBlocker("gitlab-browser", t.glabAccountTitle, busy || consent !== null);
  useEffect(() => { if (consent) confirm.current?.focus(); else trigger.current?.focus(); }, [consent]);
  const verified = snapshot.state === "connected" && !snapshot.needsCheck;
  const selectConsent = (value: "connect" | "disconnect", button: HTMLButtonElement): void => { trigger.current = button; setConsent(value); };
  return <div className="github-account" onKeyDownCapture={event => {
    if (event.key === "Escape" && consent) { event.preventDefault(); event.stopPropagation(); if (!busy) setConsent(null); }
  }}>
    <ToolInstallationRow mark={<UserRound aria-hidden="true" />} name={account ? `@${account.login}` : t.gitlabAuthAccountName}
      chip={{ label: busy ? t.gitlabAuthChip.checking : verified ? t.gitlabAuthChip.connected : account ? t.gitlabAuthChip.unchecked : t.gitlabAuthChip.signed_out, tone: verified && !busy ? "success" : "neutral" }}
      detail={<span className="github-account__host">gitlab.com · {t.accountsBrowserMethod}</span>}
      status={<p role="status" className="github-account__note">{busy && <LoaderCircle className="icon--spinning" aria-hidden="true" />}{snapshot.needsCheck ? t.gitlabAuthNeedsCheck : t.gitlabAuthStatus[snapshot.state]}</p>}
      primaryAction={account ? <button type="button" className="secondary-button" disabled={busy || !verified || consent !== null}
        onClick={event => selectConsent("disconnect", event.currentTarget)}><LogOut aria-hidden="true" />{t.gitlabAuthDisconnect}</button>
        : <button type="button" className="primary-button" disabled={busy || available !== true || consent !== null || snapshot.state !== "signed_out" || snapshot.needsCheck}
          onClick={event => selectConsent("connect", event.currentTarget)}><Plus aria-hidden="true" />{t.gitlabAuthConnect}</button>}
      recheck={<RefreshIconButton label={t.gitlabAuthCheck} busyLabel={t.accountsChecking} busy={busy}
        disabled={busy || available !== true || consent !== null} onClick={() => void controller.check()} />} />
    <p className="github-account__shared"><ShieldCheck aria-hidden="true" /><span>{t.gitlabAuthShared}</span></p>
    <p className="github-account__note">{t.gitlabAuthSelectedPurpose}</p>
    {available === false && <p className="github-account__note">{t.gitlabAuthMissing}</p>}
    {consent && <div className="github-account__authorization" role="group" aria-label={consent === "connect" ? t.gitlabAuthConnect : t.gitlabAuthDisconnect}>
      <p>{consent === "connect" ? t.gitlabAuthPermissions : t.gitlabAuthLogoutConsent.replaceAll("{login}", account?.login ?? "")}</p>
      <p>{consent === "connect" ? t.gitlabAuthStorageConsent : t.gitlabAuthLogoutBrowser}</p>
      <div className="github-account__actions">
        <button ref={confirm} type="button" className={consent === "disconnect" ? "danger-button" : "primary-button"} disabled={busy}
          onClick={() => { const choice = consent; setConsent(null); if (choice === "connect") void controller.connect(); else if (account) void controller.disconnect(account.id); }}>{consent === "connect" ? t.gitlabAuthConfirm : t.gitlabAuthDisconnect}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setConsent(null)}>{t.commonCancel}</button>
      </div>
    </div>}
    {snapshot.operationId && <button type="button" className="secondary-button" disabled={pending || snapshot.state === "cancelling"} onClick={() => void controller.cancel()}>{t.gitlabAuthCancel}</button>}
    {["failed", "invalid", "offline", "timed_out", "cli_unsupported", "environment_controlled"].includes(snapshot.state) && <p className="status-line status-line--warning" role="alert"><CircleAlert aria-hidden="true" /><span>{t.gitlabAuthStatus[snapshot.state]}</span></p>}
  </div>;
}
