import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import type { ToolChip } from "../../shared/ui";
import { AccountRow } from "./AccountRow";
import { useInstallDraftBlocker } from "../../runtime/drafts";
import type { AccountCatalog } from "./domain";

export interface TokenConnectionPort { add(token: string, requestId: string): Promise<string>; remove(accountId: string): Promise<void>; cancel(requestId: string): Promise<void> }
export type TokenConnectionCopy = {
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
  storage: string;
  title: string;
  failed: string; checking: string; chips: Record<"signed_out" | "checking" | "connected" | "invalid" | "unchecked", string>;
};

/** One provider instance's token rows. Removal confirms inline, naming the
 * account and what stays valid on the provider. */
export function TokenConnectionRows({ provider, catalog, checking, port, copy, onChanged, disabled = false }: {
  provider: string; catalog: AccountCatalog; checking: boolean; port: TokenConnectionPort; copy: TokenConnectionCopy;
  onChanged: () => void; disabled?: boolean;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const dismiss = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const restore = useRef(false);
  useEffect(() => {
    if (removing) dismiss.current?.focus();
    // The row's button is disabled during the confirmation; focus it once enabled.
    else if (restore.current) { restore.current = false; if (trigger.current?.isConnected) trigger.current.focus(); }
  }, [removing]);
  const accounts = catalog.accounts.filter(account => account.id.startsWith(`${provider}:token.`));
  const close = (): void => { restore.current = true; setRemoving(null); };
  const remove = async (id: string): Promise<void> => {
    if (pending) return;
    setPending(true); setError(null); setMessage("");
    try { await port.remove(id); if (mounted.current) { setRemoving(null); setMessage(copy.removed); } }
    catch (failure) { if (mounted.current) setError(failure); }
    finally { if (mounted.current) { setPending(false); onChanged(); } }
  };
  if (accounts.length === 0 && !message && error == null) return null;
  const busy = pending || checking || catalog.busy;
  const removalTitle = copy.removalTitle.replace("{login}", accounts.find(account => account.id === removing)?.login ?? "");
  return <div className="hosting-accounts__method" onKeyDownCapture={event => {
    if (event.key === "Escape" && removing && !pending) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    {accounts.map(account => {
      const state = checking || catalog.busy ? "checking" : account.available ? "connected" : account.unavailableReason === "authentication_failed" ? "invalid" : "unchecked";
      const chip: ToolChip = { label: copy.chips[state], tone: state === "checking" ? "neutral" : account.available ? "success" : account.unavailableReason ? "warning" : "neutral",
        icon: state === "checking" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : account.available ? <CheckCircle2 aria-hidden="true" /> : undefined };
      return <AccountRow key={account.id} login={account.login} method="token" state={chip}
        notice={!account.available && account.unavailableReason ? <p className="status-line status-line--warning"><CircleAlert aria-hidden="true" />
          <span>{localizeAppError({ code: account.unavailableReason, message: "", remediation: null }, t, copy.failed)}</span></p> : null}
        actions={<button type="button" className="secondary-button" disabled={busy || disabled || removing !== null}
          aria-label={`${copy.remove} · @${account.login}`}
          onClick={event => { trigger.current = event.currentTarget; setRemoving(account.id); setError(null); setMessage(""); }}>
          {t.accountsRemove}</button>} />;
    })}
    {removing && <div className="github-account__authorization" role="group" aria-label={removalTitle}>
      <strong>{removalTitle}</strong>
      <p>{copy.removalConsent}</p>
      <div className="github-account__actions">
        <button ref={dismiss} type="button" className="secondary-button" disabled={pending} onClick={close}>{t.commonCancel}</button>
        <button type="button" className="danger-button" disabled={busy} onClick={() => void remove(removing)}>{copy.remove}</button>
      </div>
    </div>}
    {error != null && <p role="alert" className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{localizeAppError(error, t, copy.failed)}</span></p>}
    {message && <p role="status" className="status-line status-line--success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></p>}
  </div>;
}

/** The masked token field. Uncontrolled: it is cleared before the one-way
 * native ingestion, on cancel and on unmount; nothing reaches renderer state. */
export function TokenEntryForm({ provider, port, copy, onDone, onCancel, onSettled }: {
  provider: string; port: TokenConnectionPort; copy: TokenConnectionCopy;
  onDone: (message: string) => void; onCancel: () => void;
  /** After every attempt: a lost receipt may still have saved the token. */
  onSettled?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const helpId = useId();
  const storageId = useId();
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<string | null>(null);
  const mounted = useRef(false);
  const [draft, setDraft] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useInstallDraftBlocker(`${provider}-token`, copy.title, draft || pending);
  useEffect(() => {
    mounted.current = true;
    input.current?.focus();
    return () => {
      mounted.current = false;
      if (input.current) input.current.value = "";
      if (request.current) void port.cancel(request.current).catch(() => undefined);
    };
  }, [port]);
  const submit = async (): Promise<void> => {
    if (pending || !input.current?.value) return;
    const token = input.current.value;
    input.current.value = ""; setDraft(false); setError(null); setPending(true);
    const requestId = `token_${crypto.randomUUID().replaceAll("-", "")}`;
    request.current = requestId;
    try {
      await port.add(token, requestId);
      if (mounted.current) onDone(copy.connected);
    } catch (failure) { if (mounted.current) setError(failure); }
    finally { request.current = null; if (mounted.current) setPending(false); onSettled?.(); }
  };
  const cancel = (): void => { if (input.current) input.current.value = ""; setDraft(false); onCancel(); };
  const errorCopy = isAppError(error) && error.code === "stale_preview" ? copy.exists
    : isAppError(error) && error.code === "invalid_selection" ? copy.limitReached
    : localizeAppError(error, t, copy.failed);
  return <form className="github-token__editor" onSubmit={event => { event.preventDefault(); void submit(); }}
    onKeyDownCapture={event => { if (event.key === "Escape" && !pending) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <label className="text-field"><span>{copy.label}</span><input ref={input} type="password" autoComplete="off" spellCheck={false} maxLength={4096}
      required disabled={pending} onChange={event => setDraft(event.target.value.length > 0)} aria-describedby={`${helpId} ${storageId}`} /></label>
    <small id={helpId} className="github-account__note">{copy.limit}</small>
    <p id={storageId} className="github-account__shared"><ShieldCheck aria-hidden="true" /><span>{copy.storage}</span></p>
    <details className="github-token__permissions"><summary>{copy.permissionsTitle}</summary><p>{copy.permissions}</p></details>
    {error != null && <p role="alert" className="status-line status-line--warning"><CircleAlert aria-hidden="true" /><span>{errorCopy}</span></p>}
    <div className="github-account__actions">
      <button type="button" className="secondary-button" disabled={pending} onClick={cancel}>{t.commonCancel}</button>
      <button type="submit" className="primary-button" disabled={pending || !draft}>{pending && <LoaderCircle className="icon--spinning" aria-hidden="true" />}{pending ? copy.checking : copy.connect}</button>
    </div>
  </form>;
}
