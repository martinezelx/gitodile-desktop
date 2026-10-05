import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, KeyRound, LoaderCircle, LogOut, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { RefreshIconButton, ToolInstallationRow, type ToolChip } from "../../shared/ui";
import { accountsPort } from "./tauriAdapter";
import { useAccounts } from "./useAccounts";
import type { AccountsPort } from "./port";
import { useInstallDraftBlocker } from "../../runtime/drafts";


export interface TokenConnectionPort { add(token: string, requestId: string): Promise<string>; remove(accountId: string): Promise<void>; cancel(requestId: string): Promise<void> }
export type TokenConnectionCopy = {
  add: string;
  alternative: string;
  connect: string;
  connected: string;
  exists: string;
  label: string;
  limit: string;
  limitReached: string;
  permissions: string;
  permissionsTitle: string;
  removalConsent: string;
  removalTitle: string;
  remove: string;
  removed: string;
  selectedPurpose: string;
  storage: string;
  storageShort: string;
  title: string;
  failed: string; checking: string; chips: Record<"signed_out" | "checking" | "connected" | "invalid" | "unchecked", string>;
};

/** CLI-independent connection, using the same rows as the rest of Settings.
 * The password field is
 * uncontrolled: clear it before the one-way native ingestion and on unmount. */
export function TokenConnectionSection({ provider, copy, port, accountPort = accountsPort }: {
  provider: string; copy: TokenConnectionCopy; port: TokenConnectionPort; accountPort?: AccountsPort;
}): React.JSX.Element {
  const { t } = useLanguage();
  const headingId = useId();
  const helpId = useId();
  const storageId = useId();
  const { catalog, failed, reload, check, pending: checking } = useAccounts(accountPort, true);
  const input = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const dismissRemoval = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const removedConnection = useRef<string | null>(null);
  const wasInline = useRef(false);
  const [draft, setDraft] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const mounted = useRef(false);
  const request = useRef<string | null>(null);
  const running = useRef(false);
  useInstallDraftBlocker(`${provider}-token`, copy.title, draft || pending);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (input.current) input.current.value = "";
      if (request.current) void port.cancel(request.current).catch(() => undefined);
    };
  }, [port]);
  useEffect(() => {
    if (!pending) {
      if (editing) input.current?.focus();
      else if (removing) dismissRemoval.current?.focus();
      else if (removedConnection.current) {
        // Catalog reload may unmount the old row or move the add button from
        // the footer to the empty state. Restore after that receipt as well.
        addButton.current?.focus();
        if (!catalog.accounts.some(account => account.id === removedConnection.current)) removedConnection.current = null;
      }
      else if (wasInline.current) {
        if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
        else addButton.current?.focus();
      }
      wasInline.current = editing || removing !== null;
    }
  }, [editing, removing, pending, catalog.accounts]);
  const submit = async (): Promise<void> => {
    if (running.current || !input.current?.value) return;
    running.current = true;
    const token = input.current.value;
    input.current.value = ""; setDraft(false); setError(null); setMessage(""); setPending(true);
    const requestId = `token_${crypto.randomUUID().replaceAll("-", "")}`;
    request.current = requestId;
    try {
      await port.add(token, requestId);
      if (mounted.current) { setEditing(false); setMessage(copy.connected); }
    } catch (error) { if (mounted.current) setError(error); }
    finally { running.current = false; request.current = null; if (mounted.current) { reload(); setPending(false); } }
  };
  const remove = async (id: string): Promise<void> => {
    if (running.current) return;
    running.current = true; setPending(true); setError(null); setMessage("");
    try { await port.remove(id); if (mounted.current) { removedConnection.current = id; setRemoving(null); setMessage(copy.removed); } }
    catch (error) { if (mounted.current) setError(error); }
    finally { running.current = false; if (mounted.current) { reload(); setPending(false); } }
  };
  const busy = pending || checking || catalog.busy;
  const accounts = catalog.accounts.filter(account => account.id.startsWith(`${provider}:token.`));
  const errorCopy = isAppError(error) && error.code === "stale_preview" ? copy.exists
    : editing && isAppError(error) && error.code === "invalid_selection" ? copy.limitReached
    : localizeAppError(error, t, copy.failed);
  const removalTitle = copy.removalTitle.replace("{login}", accounts.find(account => account.id === removing)?.login ?? "");
  const add = <button ref={addButton} type="button" className={accounts.length ? "secondary-button" : "primary-button"}
    disabled={failed || busy || editing || removing !== null} onClick={event => {
      trigger.current = event.currentTarget; setEditing(true); setError(null); setMessage("");
    }}><Plus aria-hidden="true" />{copy.add}</button>;
  return <section className="settings-group" aria-labelledby={headingId}>
    <header className="settings-group__header">
      <h3 id={headingId}>{copy.title}</h3><p>{copy.alternative}</p>
    </header>
    <div className="settings-group__body github-account github-token" onKeyDownCapture={event => {
    if (event.key === "Escape" && (editing || removing)) {
      event.preventDefault(); event.stopPropagation();
      if (pending) return;
      if (input.current) input.current.value = "";
      setDraft(false); setEditing(false); setRemoving(null);
    }
  }}>
    {failed && <div role="alert" className="status-line status-line--warning">
      <CircleAlert aria-hidden="true" /><span>{t.accountsCatalogFailed}</span>
      <button type="button" className="secondary-button" disabled={busy} onClick={reload}>{t.accountsRetryRead}</button>
    </div>}
    {!failed && accounts.length === 0 && <ToolInstallationRow mark={<KeyRound aria-hidden="true" />} name={copy.label}
      chip={{ label: copy.chips.signed_out, tone: "neutral" }}
      detail={<span className="github-account__note">{copy.selectedPurpose}</span>} status={null}
      hint={<><ShieldCheck aria-hidden="true" /><span>{copy.storageShort}</span></>} primaryAction={add} />}
    {accounts.map(account => {
      const checkingAccount = checking || catalog.busy;
      const state = checkingAccount ? "checking" : account.available ? "connected" : account.unavailableReason === "authentication_failed" ? "invalid" : "unchecked";
      const chip: ToolChip = { label: copy.chips[state], tone: checkingAccount ? "neutral" : account.available ? "success" : account.unavailableReason ? "warning" : "neutral",
        icon: checkingAccount ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : account.available ? <CheckCircle2 aria-hidden="true" /> : undefined };
      return <div key={account.id} className="github-account__row" role="group" aria-label={`@${account.login}`}>
        <ToolInstallationRow mark={<UserRound aria-hidden="true" />} name={`@${account.login}`} chip={chip}
          detail={<span className="github-account__host">{account.host} · {t.accountsTokenMethod}</span>}
          status={!account.available && account.unavailableReason ? <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" />
            <span>{localizeAppError({ code: account.unavailableReason, message: "", remediation: null }, t, copy.failed)}</span></p> : null}
          primaryAction={<button type="button" className="secondary-button" disabled={busy || editing || removing !== null}
            onClick={event => { trigger.current = event.currentTarget; setRemoving(account.id); setError(null); setMessage(""); }}>
            <LogOut aria-hidden="true" />{copy.remove}</button>} />
      </div>;
    })}
    {accounts.length > 0 && <div className="github-account__footer">
      <p className="github-account__note">{copy.selectedPurpose}</p>
      <div className="github-account__actions">
        <RefreshIconButton label={t.accountsCheck} busyLabel={t.accountsChecking} busy={checking || catalog.busy}
          disabled={busy || editing || removing !== null} onClick={() => void check(provider)} />{add}
      </div>
    </div>}
    {editing && <form className="github-token__editor" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="text-field"><span>{copy.label}</span><input ref={input} type="password" autoComplete="off" spellCheck={false} maxLength={4096}
        required disabled={pending} onChange={event => setDraft(event.target.value.length > 0)} aria-describedby={`${helpId} ${storageId}`} /></label>
      <small id={helpId} className="github-account__note">{copy.limit}</small>
      <p id={storageId} className="github-account__shared"><ShieldCheck aria-hidden="true" /><span>{copy.storage}</span></p>
      <details className="github-token__permissions"><summary>{copy.permissionsTitle}</summary><p>{copy.permissions}</p></details>
      <div className="github-account__actions">
        <button type="submit" className="primary-button" disabled={busy || !draft}>{pending && <LoaderCircle className="icon--spinning" aria-hidden="true" />}{pending ? copy.checking : copy.connect}</button>
        <button type="button" className="secondary-button" disabled={pending} onClick={() => { if (input.current) input.current.value = ""; setDraft(false); setEditing(false); }}>{t.commonCancel}</button>
      </div>
    </form>}
    {removing && <div className="github-account__authorization" role="group" aria-label={removalTitle}>
      <strong>{removalTitle}</strong>
      <p>{copy.removalConsent}</p>
      <div className="github-account__actions">
        <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(removing)}>{copy.remove}</button>
        <button ref={dismissRemoval} type="button" className="secondary-button" disabled={pending} onClick={() => setRemoving(null)}>{t.commonCancel}</button>
      </div>
    </div>}
    {error != null && <p role="alert" className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{errorCopy}</span></p>}
    {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
  </div></section>;
}
